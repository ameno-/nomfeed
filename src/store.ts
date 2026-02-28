/**
 * Store — flat-file storage for MarkStash items.
 *
 * ~/.markstash/
 *   items.json   — metadata index (array of Item)
 *   content/     — markdown files named {id}.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { nanoid } from "nanoid";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Item {
  id: string;
  type: "url" | "file" | "note";
  source: string;          // URL or file path
  title: string;
  tags: string[];
  savedAt: string;         // ISO 8601
  file: string;            // filename in content/
}

// ── Paths ──────────────────────────────────────────────────────────────────

const DATA_DIR = process.env.MARKSTASH_DIR || join(process.env.HOME || "~", ".markstash");
const INDEX_PATH = join(DATA_DIR, "items.json");
const CONTENT_DIR = join(DATA_DIR, "content");

export function getDataDir() { return DATA_DIR; }
export function getContentDir() { return CONTENT_DIR; }

// ── Init ───────────────────────────────────────────────────────────────────

function ensureDirs() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });
  if (!existsSync(INDEX_PATH)) writeFileSync(INDEX_PATH, "[]", "utf-8");
}

// ── Index CRUD ─────────────────────────────────────────────────────────────

export function loadIndex(): Item[] {
  ensureDirs();
  return JSON.parse(readFileSync(INDEX_PATH, "utf-8"));
}

function saveIndex(items: Item[]) {
  ensureDirs();
  writeFileSync(INDEX_PATH, JSON.stringify(items, null, 2), "utf-8");
}

// ── Public API ─────────────────────────────────────────────────────────────

export function addItem(opts: {
  type: Item["type"];
  source: string;
  title: string;
  markdown: string;
  tags?: string[];
}): Item {
  const items = loadIndex();
  const id = nanoid(10);
  const filename = `${id}.md`;

  // Build frontmatter
  const frontmatter = [
    "---",
    `source: ${opts.source}`,
    `title: "${opts.title.replace(/"/g, '\\"')}"`,
    `savedAt: ${new Date().toISOString()}`,
    opts.tags?.length ? `tags: [${opts.tags.join(", ")}]` : null,
    "---",
    "",
  ].filter(Boolean).join("\n");

  const fullContent = frontmatter + opts.markdown;
  writeFileSync(join(CONTENT_DIR, filename), fullContent, "utf-8");

  const item: Item = {
    id,
    type: opts.type,
    source: opts.source,
    title: opts.title,
    tags: opts.tags || [],
    savedAt: new Date().toISOString(),
    file: filename,
  };

  items.push(item);
  saveIndex(items);
  return item;
}

export function getItem(id: string): Item | undefined {
  return loadIndex().find(i => i.id === id);
}

export function readContent(id: string): string | null {
  const item = getItem(id);
  if (!item) return null;
  const path = join(CONTENT_DIR, item.file);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function listItems(opts?: { query?: string; tag?: string; type?: string; limit?: number }): Item[] {
  let items = loadIndex();

  if (opts?.type) items = items.filter(i => i.type === opts.type);
  if (opts?.tag) items = items.filter(i => i.tags.includes(opts.tag!));
  if (opts?.query) {
    const q = opts.query.toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.source.toLowerCase().includes(q)
    );
  }
  if (opts?.limit) items = items.slice(0, opts.limit);

  return items;
}

export function searchContent(query: string, limit = 20): Array<Item & { snippet: string }> {
  const items = loadIndex();
  const q = query.toLowerCase();
  const results: Array<Item & { snippet: string }> = [];

  for (const item of items) {
    const path = join(CONTENT_DIR, item.file);
    if (!existsSync(path)) continue;

    const content = readFileSync(path, "utf-8").toLowerCase();
    const idx = content.indexOf(q);
    if (idx === -1 && !item.title.toLowerCase().includes(q)) continue;

    const snippetStart = Math.max(0, idx - 80);
    const snippetEnd = Math.min(content.length, idx + query.length + 80);
    const snippet = idx >= 0
      ? "..." + content.slice(snippetStart, snippetEnd).trim() + "..."
      : item.title;

    results.push({ ...item, snippet });
    if (results.length >= limit) break;
  }

  return results;
}

export function deleteItem(id: string): boolean {
  const items = loadIndex();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return false;

  const item = items[idx];
  const path = join(CONTENT_DIR, item.file);
  if (existsSync(path)) unlinkSync(path);

  items.splice(idx, 1);
  saveIndex(items);
  return true;
}

export function itemCount(): number {
  return loadIndex().length;
}
