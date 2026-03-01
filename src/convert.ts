/**
 * Convert — turn URLs and files into Markdown.
 *
 * URL fetch strategy (tried in order):
 *   1. Cloudflare `Accept: text/markdown` — returns clean MD if the site supports it
 *   2. Jina Reader (r.jina.ai) — renders JS, extracts article content as markdown
 *   3. Readability fallback — fetch HTML, extract with Readability, convert with Turndown
 *
 * File conversion:
 *   Shell out to Python `markitdown` CLI
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { parseHTML } from "linkedom";
import { join } from "path";
import { isYouTubeUrl, extractYouTube } from "./youtube";

// ── URL → Markdown ─────────────────────────────────────────────────────────

export async function urlToMarkdown(url: string): Promise<{ title: string; markdown: string; strategy: string }> {
  // YouTube gets special handling via yt-dlp
  if (isYouTubeUrl(url)) {
    const yt = await extractYouTube(url);
    return { title: yt.title, markdown: yt.markdown, strategy: "yt-dlp" };
  }

  // Strategy 1: Cloudflare Markdown for Agents
  const cfResult = await tryCloudflareMarkdown(url);
  if (cfResult) return { ...cfResult, strategy: "cloudflare" };

  // Strategy 2: Jina Reader (renders JS, returns markdown)
  const jinaResult = await tryJinaReader(url);
  if (jinaResult) return { ...jinaResult, strategy: "jina" };

  // Strategy 3: Direct fetch + Readability + Turndown
  const readabilityResult = await tryReadability(url);
  if (readabilityResult) return { ...readabilityResult, strategy: "readability" };

  throw new Error(`All fetch strategies failed for: ${url}`);
}

// ── Strategy 1: Cloudflare text/markdown ───────────────────────────────────

async function tryCloudflareMarkdown(url: string): Promise<{ title: string; markdown: string } | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "Accept": "text/markdown, text/html;q=0.9",
        "User-Agent": "MarkStash/1.0 (compatible; AI-agent)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") || "";

    // Only use this path if we actually got markdown back
    if (!contentType.includes("text/markdown")) return null;

    const md = await resp.text();
    if (!md.trim() || md.trim().length < 50) return null;

    const title = extractTitleFromMarkdown(md) || new URL(url).hostname;
    return { title, markdown: md };
  } catch {
    return null;
  }
}

// ── Strategy 2: Jina Reader ───────────────────────────────────────────────

async function tryJinaReader(url: string): Promise<{ title: string; markdown: string } | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const resp = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "User-Agent": "MarkStash/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) return null;

    const md = await resp.text();
    if (!md.trim() || md.trim().length < 50) return null;

    const title = extractTitleFromMarkdown(md) || new URL(url).hostname;
    return { title, markdown: md };
  } catch {
    return null;
  }
}

// ── Strategy 3: Readability + Turndown ─────────────────────────────────────

async function tryReadability(url: string): Promise<{ title: string; markdown: string } | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "MarkStash/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) return null;

    const html = await resp.text();
    if (!html.trim()) return null;

    return htmlToMarkdown(html, url);
  } catch {
    return null;
  }
}

function htmlToMarkdown(html: string, url: string): { title: string; markdown: string } | null {
  const { document } = parseHTML(html);

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Try Readability for article extraction
  const reader = new Readability(document as any);
  const article = reader.parse();

  if (article && article.content && article.textContent.trim().length > 50) {
    const markdown = td.turndown(article.content);
    if (markdown.trim().length > 50) {
      return { title: article.title || new URL(url).hostname, markdown };
    }
  }

  // Fallback: convert entire body
  const body = document.querySelector("body");
  if (!body) return null;

  const markdown = td.turndown(body.innerHTML);
  if (markdown.trim().length < 20) return null;

  const titleEl = document.querySelector("title");
  const title = titleEl?.textContent || new URL(url).hostname;
  return { title, markdown };
}

function extractTitleFromMarkdown(md: string): string | null {
  // Look for first # heading
  const match = md.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();

  // Look for Title: in frontmatter
  const fmMatch = md.match(/^title:\s*(.+)$/m);
  if (fmMatch) return fmMatch[1].trim().replace(/^["']|["']$/g, "");

  return null;
}

// ── File → Markdown ────────────────────────────────────────────────────────

export async function fileToMarkdown(filePath: string): Promise<{ title: string; markdown: string }> {
  const absPath = filePath.startsWith("/") ? filePath : `${process.cwd()}/${filePath}`;

  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  // Already markdown — pass through
  if (absPath.endsWith(".md") || absPath.endsWith(".mdx")) {
    const content = readFileSync(absPath, "utf-8");
    const title = extractTitleFromMarkdown(content) || filePath.split("/").pop() || filePath;
    return { title, markdown: content };
  }

  // Plain text — pass through
  if (absPath.endsWith(".txt")) {
    const content = readFileSync(absPath, "utf-8");
    const title = filePath.split("/").pop() || filePath;
    return { title, markdown: content };
  }

  // Use Python markitdown for everything else
  // Try .venv/bin/markitdown first, then global markitdown
  const venvPath = join(__dirname, "..", ".venv", "bin", "markitdown");
  const cmd = existsSync(venvPath) ? venvPath : "markitdown";

  try {
    const result = execSync(`"${cmd}" "${absPath}"`, {
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 50 * 1024 * 1024,
    });

    const title = extractTitleFromMarkdown(result) || filePath.split("/").pop() || filePath;
    return { title, markdown: result };
  } catch (err: any) {
    if (err.message?.includes("not found") || err.message?.includes("ENOENT")) {
      throw new Error(
        "markitdown not found. Install it with: pip install 'markitdown[all]'\n" +
        "Or create a venv: python3 -m venv .venv && .venv/bin/pip install 'markitdown[all]'"
      );
    }
    throw new Error(`markitdown failed: ${err.message}`);
  }
}

// ── Note → Markdown ────────────────────────────────────────────────────────

export function noteToMarkdown(text: string, title?: string): { title: string; markdown: string } {
  const autoTitle = title || text.slice(0, 60).replace(/\n/g, " ").trim();
  return { title: autoTitle, markdown: text };
}
