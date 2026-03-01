/**
 * YouTube — extract metadata + transcript via yt-dlp.
 *
 * No video download. Just metadata JSON + subtitle VTT → clean timestamped text.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { nanoid } from "nanoid";

export interface YouTubeResult {
  title: string;
  channel: string;
  duration: number;
  uploadDate: string;
  description: string;
  url: string;
  transcript: string;           // clean timestamped text
  transcriptPlain: string;      // no timestamps, for LLM input
  markdown: string;             // composed markdown document
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("youtube.com") || host.includes("youtu.be");
  } catch {
    return false;
  }
}

export async function extractYouTube(url: string): Promise<YouTubeResult> {
  // 1. Get metadata
  const meta = getMetadata(url);

  // 2. Get transcript
  const transcript = getTranscript(url);
  const transcriptPlain = transcript
    .replace(/^\[[\d:]+\]\s*/gm, "")  // strip timestamps
    .trim();

  // 3. Compose markdown
  const duration = formatDuration(meta.duration);
  const date = formatDate(meta.upload_date);

  const markdown = [
    `# ${meta.title}`,
    "",
    `**Channel:** ${meta.channel} | **Duration:** ${duration} | **Date:** ${date}`,
    "",
    meta.description ? `## Description\n\n${meta.description.slice(0, 1000)}` : "",
    "",
    "## Transcript",
    "",
    transcript,
  ].filter(l => l !== undefined).join("\n");

  return {
    title: meta.title,
    channel: meta.channel || "Unknown",
    duration: meta.duration || 0,
    uploadDate: date,
    description: meta.description || "",
    url,
    transcript,
    transcriptPlain,
    markdown,
  };
}

// ── Metadata ───────────────────────────────────────────────────────────────

interface YTMeta {
  title: string;
  channel: string;
  duration: number;
  upload_date: string;
  description: string;
}

function getMetadata(url: string): YTMeta {
  try {
    const raw = execSync(
      `yt-dlp --dump-json --no-download --no-warnings "${url}"`,
      { encoding: "utf-8", timeout: 30_000, maxBuffer: 10 * 1024 * 1024 }
    );
    const data = JSON.parse(raw);
    return {
      title: data.title || "Untitled",
      channel: data.channel || data.uploader || "Unknown",
      duration: data.duration || 0,
      upload_date: data.upload_date || "",
      description: data.description || "",
    };
  } catch (err: any) {
    if (err.message?.includes("not found") || err.message?.includes("ENOENT")) {
      throw new Error("yt-dlp not found. Install it: brew install yt-dlp (or pip install yt-dlp)");
    }
    throw new Error(`yt-dlp metadata failed: ${err.message}`);
  }
}

// ── Transcript ─────────────────────────────────────────────────────────────

function getTranscript(url: string): string {
  const tmpDir = join(tmpdir(), `markstash-yt-${nanoid(6)}`);
  execSync(`mkdir -p "${tmpDir}"`);

  try {
    // Try manual subs first, then auto-generated — only English
    const subArgs = [
      `--write-subs --write-auto-subs`,
      `--sub-format vtt`,
      `--sub-langs "en"`,
      `--skip-download`,
      `--no-warnings`,
      `-o "${join(tmpDir, "sub")}"`,
      `"${url}"`,
    ].join(" ");

    execSync(`yt-dlp ${subArgs}`, {
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Find the VTT file
    const files = readdirSync(tmpDir).filter(f => f.endsWith(".vtt"));
    if (files.length === 0) {
      return "(No transcript available for this video)";
    }

    const vttContent = readFileSync(join(tmpDir, files[0]), "utf-8");
    return parseVTT(vttContent);
  } finally {
    // Cleanup
    try { execSync(`rm -rf "${tmpDir}"`); } catch {}
  }
}

// ── VTT Parser ─────────────────────────────────────────────────────────────

function parseVTT(vtt: string): string {
  const lines = vtt.split("\n");
  const entries: Array<{ time: string; text: string }> = [];
  let currentTime = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Timestamp line: "00:00:01.234 --> 00:00:05.678"
    const timeMatch = line.match(/^(\d{2}:\d{2}:\d{2})\.\d+ --> /);
    if (timeMatch) {
      currentTime = timeMatch[1];
      continue;
    }

    // Skip VTT headers and empty lines
    if (!line || line === "WEBVTT" || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    if (/^\d+$/.test(line)) continue; // cue number
    if (line.includes("-->")) continue; // timestamp we already processed

    // Clean the text: strip VTT formatting tags
    let text = line
      .replace(/<[\d:.]+>/g, "")       // strip <00:00:01.234> inline timestamps
      .replace(/<\/?[^>]+>/g, "")       // strip <c>, </c>, etc.
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();

    if (!text) continue;

    // Deduplicate: VTT often repeats lines across overlapping cues
    const lastEntry = entries[entries.length - 1];
    if (lastEntry && lastEntry.text === text) continue;

    // Also skip if this text is a substring of the previous (progressive reveal)
    if (lastEntry && lastEntry.text.endsWith(text)) continue;
    if (lastEntry && text.startsWith(lastEntry.text)) {
      // This is the more complete version — replace
      lastEntry.text = text;
      lastEntry.time = currentTime;
      continue;
    }

    entries.push({ time: currentTime, text });
  }

  return entries
    .map(e => `[${e.time}] ${e.text}`)
    .join("\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "Unknown";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
