/**
 * Import — parsers for bookmark exports and social media archives.
 */

import { existsSync, readFileSync } from "fs";

export type ImportSource = "twitter" | "browser" | "pinboard" | "raindrop" | "json";

export interface ImportItem {
  url: string;
  title?: string;
  description?: string;
  tags?: string[];
  createdAt?: Date;
  author?: string;
  sourceType: ImportSource;
  raw?: unknown;
}

export interface ImportResult {
  items: ImportItem[];
  total: number;
  errors: string[];
}

// ── Twitter/X Format ───────────────────────────────────────────────────────

interface TwitterMedia {
  type: "photo" | "video" | "gif";
  url: string;
}

interface TwitterBookmark {
  id: string;
  text: string;
  author: string;
  handle: string;
  avatar?: string;
  timestamp?: string;
  media?: TwitterMedia[];
  hashtags?: string[];
  urls?: string[];
}

interface TwitterExport {
  bookmarks: TwitterBookmark[];
  source?: "bookmark" | "like";
  exportDate?: string;
}

function parseTwitterExport(json: unknown): ImportResult {
  const errors: string[] = [];
  const items: ImportItem[] = [];

  let data: TwitterExport;

  if (typeof json === "object" && json !== null && "bookmarks" in json) {
    data = json as TwitterExport;
  } else if (Array.isArray(json)) {
    data = { bookmarks: json as TwitterBookmark[] };
  } else {
    return { items: [], total: 0, errors: ["Invalid Twitter export format: expected {bookmarks: [...]} or array"] };
  }

  for (const bookmark of data.bookmarks || []) {
    try {
      if (!bookmark.id) {
        errors.push(`Skipping item without id`);
        continue;
      }

      const url = `https://x.com/${bookmark.handle?.replace("@", "") || "i"}/status/${bookmark.id}`;
      const tags: string[] = [
        ...(data.source ? [data.source] : ["bookmark"]),
        ...(bookmark.hashtags || []),
        "twitter",
      ];

      const mediaUrls = bookmark.media?.map(m => m.url).filter(Boolean) || [];
      const allUrls = [...new Set([...(bookmark.urls || []), ...mediaUrls])];

      let description = bookmark.text || "";
      if (allUrls.length > 0) {
        description += `\n\nLinks: ${allUrls.join(" ")}`;
      }

      items.push({
        url,
        title: `${bookmark.author || "Unknown"}: ${bookmark.text?.slice(0, 80) || "Tweet"}${bookmark.text && bookmark.text.length > 80 ? "..." : ""}`,
        description,
        tags,
        createdAt: bookmark.timestamp ? new Date(bookmark.timestamp) : undefined,
        author: bookmark.handle,
        sourceType: "twitter",
        raw: bookmark,
      });
    } catch (err) {
      errors.push(`Failed to parse bookmark: ${err}`);
    }
  }

  return { items, total: items.length, errors };
}

// ── Browser HTML Format (Netscape) ─────────────────────────────────────────

function parseBrowserHtml(html: string): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  // Simple regex-based parsing for Netscape bookmark format
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const addDateRegex = /add_date="(\d+)"/i;
  const tagsRegex = /tags="([^"]*)"/i;

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const url = match[1];
      const title = match[2]?.trim();

      if (!url || url.startsWith("javascript:") || url.startsWith("data:")) {
        continue;
      }

      const addDateMatch = match[0].match(addDateRegex);
      const tagsMatch = match[0].match(tagsRegex);

      const createdAt = addDateMatch
        ? new Date(parseInt(addDateMatch[1]) * 1000)
        : undefined;

      const tags = tagsMatch
        ? tagsMatch[1].split(",").map(t => t.trim()).filter(Boolean)
        : undefined;

      items.push({
        url,
        title,
        createdAt,
        tags,
        sourceType: "browser",
      });
    } catch (err) {
      errors.push(`Failed to parse link: ${err}`);
    }
  }

  return { items, total: items.length, errors };
}

// ── Generic JSON Format ────────────────────────────────────────────────────

function parseGenericJson(json: unknown): ImportResult {
  const items: ImportItem[] = [];
  const errors: string[] = [];

  let entries: unknown[] = [];

  if (Array.isArray(json)) {
    entries = json;
  } else if (typeof json === "object" && json !== null) {
    // Try common wrapper keys
    const obj = json as Record<string, unknown>;
    for (const key of ["items", "bookmarks", "links", "data", "results"]) {
      if (Array.isArray(obj[key])) {
        entries = obj[key] as unknown[];
        break;
      }
    }
  }

  if (entries.length === 0) {
    return { items: [], total: 0, errors: ["No items found in JSON"] };
  }

  for (const entry of entries) {
    try {
      if (typeof entry !== "object" || entry === null) continue;

      const e = entry as Record<string, unknown>;
      const url = (e.url || e.link || e.href || e.source) as string;

      if (!url || typeof url !== "string") {
        continue;
      }

      const title = (e.title || e.name || e.text || e.description) as string | undefined;
      const tags = Array.isArray(e.tags)
        ? e.tags.map(String)
        : typeof e.tags === "string"
          ? e.tags.split(",").map(t => t.trim())
          : undefined;

      items.push({
        url,
        title,
        description: (e.description || e.note || e.summary) as string | undefined,
        tags,
        createdAt: e.createdAt ? new Date(e.createdAt as string) : undefined,
        sourceType: "json",
        raw: entry,
      });
    } catch (err) {
      errors.push(`Failed to parse entry: ${err}`);
    }
  }

  return { items, total: items.length, errors };
}

// ── Main Import Function ───────────────────────────────────────────────────

export function importBookmarks(
  filePath: string,
  source: ImportSource = "json"
): ImportResult {
  if (!existsSync(filePath)) {
    return { items: [], total: 0, errors: [`File not found: ${filePath}`] };
  }

  const content = readFileSync(filePath, "utf-8").trim();

  // Auto-detect source if not specified
  if (source === "json") {
    if (content.startsWith("{") || content.startsWith("[")) {
      try {
        const parsed = JSON.parse(content);

        // Check for Twitter format
        if (
          (typeof parsed === "object" &&
            parsed !== null &&
            "bookmarks" in parsed &&
            Array.isArray(parsed.bookmarks) &&
            parsed.bookmarks.length > 0 &&
            typeof parsed.bookmarks[0] === "object" &&
            parsed.bookmarks[0] !== null &&
            ("id" in parsed.bookmarks[0] || "text" in parsed.bookmarks[0])) ||
          (Array.isArray(parsed) &&
            parsed.length > 0 &&
            typeof parsed[0] === "object" &&
            parsed[0] !== null &&
            ("id" in parsed[0] || "text" in parsed[0]))
        ) {
          source = "twitter";
        }
      } catch {
        // Not valid JSON, will error below
      }
    }
  }

  // Parse based on source
  switch (source) {
    case "twitter": {
      try {
        const parsed = JSON.parse(content);
        return parseTwitterExport(parsed);
      } catch (err) {
        return { items: [], total: 0, errors: [`Invalid JSON: ${err}`] };
      }
    }

    case "browser":
      return parseBrowserHtml(content);

    case "json":
    case "pinboard":
    case "raindrop": {
      try {
        const parsed = JSON.parse(content);
        return parseGenericJson(parsed);
      } catch (err) {
        return { items: [], total: 0, errors: [`Invalid JSON: ${err}`] };
      }
    }

    default:
      return { items: [], total: 0, errors: [`Unknown source: ${source}`] };
  }
}
