/**
 * Convert — turn URLs and files into Markdown.
 *
 * URLs:  1) Try Cloudflare `Accept: text/markdown`
 *        2) Fallback: fetch HTML → Readability → Turndown
 *
 * Files: Shell out to Python `markitdown` CLI
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { parseHTML } from "linkedom";

// ── URL → Markdown ─────────────────────────────────────────────────────────

export async function urlToMarkdown(url: string): Promise<{ title: string; markdown: string }> {
  // Strategy 1: Ask for text/markdown directly (Cloudflare Markdown for Agents)
  try {
    const resp = await fetch(url, {
      headers: {
        "Accept": "text/markdown, text/html;q=0.9",
        "User-Agent": "MarkStash/1.0 (compatible; AI-agent)",
      },
      redirect: "follow",
    });

    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("text/markdown")) {
      const md = await resp.text();
      const title = extractTitleFromMarkdown(md) || new URL(url).hostname;
      return { title, markdown: md };
    }

    // We got HTML back — use it for fallback
    const html = await resp.text();
    return htmlToMarkdown(html, url);
  } catch {
    // Strategy 2: Plain fetch + Readability
    const resp = await fetch(url, {
      headers: { "User-Agent": "MarkStash/1.0" },
      redirect: "follow",
    });
    const html = await resp.text();
    return htmlToMarkdown(html, url);
  }
}

function htmlToMarkdown(html: string, url: string): { title: string; markdown: string } {
  const { document } = parseHTML(html);

  // Try Readability for article extraction
  const reader = new Readability(document as any);
  const article = reader.parse();

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  if (article) {
    const markdown = td.turndown(article.content);
    return { title: article.title || new URL(url).hostname, markdown };
  }

  // Fallback: convert entire body
  const body = document.querySelector("body");
  const markdown = body ? td.turndown(body.innerHTML) : html;
  const titleEl = document.querySelector("title");
  const title = titleEl?.textContent || new URL(url).hostname;

  return { title, markdown };
}

function extractTitleFromMarkdown(md: string): string | null {
  // Look for first # heading
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

// ── File → Markdown ────────────────────────────────────────────────────────

export async function fileToMarkdown(filePath: string): Promise<{ title: string; markdown: string }> {
  const absPath = filePath.startsWith("/") ? filePath : `${process.cwd()}/${filePath}`;

  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  // Check if it's already markdown
  if (absPath.endsWith(".md") || absPath.endsWith(".mdx")) {
    const content = readFileSync(absPath, "utf-8");
    const title = extractTitleFromMarkdown(content) || filePath.split("/").pop() || filePath;
    return { title, markdown: content };
  }

  // Check if it's a plain text file
  if (absPath.endsWith(".txt")) {
    const content = readFileSync(absPath, "utf-8");
    const title = filePath.split("/").pop() || filePath;
    return { title, markdown: content };
  }

  // Use Python markitdown for everything else
  try {
    const result = execSync(`markitdown "${absPath}"`, {
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    const title = extractTitleFromMarkdown(result) || filePath.split("/").pop() || filePath;
    return { title, markdown: result };
  } catch (err: any) {
    // If markitdown isn't installed, give a helpful error
    if (err.message?.includes("not found") || err.message?.includes("ENOENT")) {
      throw new Error(
        "markitdown not found. Install it with: pip install 'markitdown[all]'\n" +
        "See: https://github.com/microsoft/markitdown"
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
