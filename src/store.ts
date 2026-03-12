/**
 * Store — page-centric flat-file storage for NomFeed items.
 *
 * ~/.nomfeed/
 *   index.json               — page item index
 *   items/
 *     <id>/
 *       item.json
 *       source.md
 *       extraction.md
 *       captures/
 *         <capture-id>/
 *           annotation.json
 *           screenshots/
 *
 * Legacy layout remains readable:
 *   items.json
 *   content/{id}.md
 *   content/{id}.extraction.md
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { nanoid } from "nanoid";
import {
  analyzeCapture,
  normalizeCaptureElement,
  normalizeViewport,
  searchableCaptureText,
} from "./capture";
import type {
  CaptureBundle,
  CaptureScreenshot,
  CaptureStatus,
  SaveCaptureInput,
} from "./capture";

// ── Types ──────────────────────────────────────────────────────────────────

export type ArtifactType = "twitter";

export interface TwitterArtifactMedia {
  type: "photo" | "video" | "gif" | "link";
  url: string;
  previewUrl?: string;
  altText?: string;
}

export interface TwitterArtifactSource {
  mode: "extension" | "page-deck" | "import" | "background-sync" | "manual";
  pageUrl?: string;
  capturedAt?: string;
}

export interface TwitterArtifactData {
  url?: string;
  tweetId?: string;
  authorHandle?: string;
  authorName?: string;
  text?: string;
  createdAt?: string;
  bookmarkedAt?: string;
  conversationId?: string;
  inReplyToTweetId?: string;
  quotedTweetId?: string;
  captureKind?: "tweet" | "bookmark" | "thread" | "timeline" | "profile" | "search" | "likes";
  pageTitle?: string;
  hashtags?: string[];
  mentions?: string[];
  urls?: string[];
  media?: TwitterArtifactMedia[];
  threadTweetIds?: string[];
  source?: TwitterArtifactSource;
  raw?: unknown;
}

export interface SaveItemArtifactInput {
  type: ArtifactType;
  title?: string;
  tags?: string[];
  twitter?: TwitterArtifactData;
}

export interface ItemArtifact {
  id: string;
  itemId: string;
  type: ArtifactType;
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  summary: string;
  searchableText: string;
  twitter?: TwitterArtifactData;
}

export interface Item {
  id: string;
  type: "url" | "file" | "note";
  source: string;
  canonicalSource?: string;
  title: string;
  tags: string[];
  savedAt: string;
  updatedAt?: string;
  file?: string; // legacy content/<id>.md filename
  strategy?: string;
  extracted?: boolean;
  extractedAt?: string;
  extractionPatterns?: string[];
  captureCount?: number;
  latestCaptureId?: string;
  latestCaptureAt?: string;
  artifactCount?: number;
  latestArtifactId?: string;
  latestArtifactAt?: string;
  artifactTypes?: ArtifactType[];
  layout?: "legacy" | "page";
}

export interface ItemBundle {
  item: Item;
  content: string | null;
  extraction?: string;
  captures: CaptureBundle[];
  artifacts: ItemArtifact[];
}

export interface SearchResult extends Item {
  snippet: string;
  matchType?: "content" | "extraction" | "capture" | "artifact";
}

// ── Paths ──────────────────────────────────────────────────────────────────

const INDEX_FILENAME = "index.json";
const LEGACY_INDEX_FILENAME = "items.json";

export function getDataDir() { return process.env.NOMFEED_DIR || join(process.env.HOME || "~", ".nomfeed"); }
export function getContentDir() { return join(getDataDir(), "content"); }
export function getItemsDir() { return join(getDataDir(), "items"); }

function getIndexPath() { return join(getDataDir(), INDEX_FILENAME); }
function getLegacyIndexPath() { return join(getDataDir(), LEGACY_INDEX_FILENAME); }
function getItemDir(id: string) { return join(getItemsDir(), id); }
function getItemMetaPath(id: string) { return join(getItemDir(id), "item.json"); }
function getItemSourcePath(id: string) { return join(getItemDir(id), "source.md"); }
function getItemExtractionPath(id: string) { return join(getItemDir(id), "extraction.md"); }
function getCaptureRoot(itemId: string) { return join(getItemDir(itemId), "captures"); }
function getArtifactRoot(itemId: string) { return join(getItemDir(itemId), "artifacts"); }
function getCaptureDir(itemId: string, captureId: string) { return join(getCaptureRoot(itemId), captureId); }
function getArtifactDir(itemId: string, artifactId: string) { return join(getArtifactRoot(itemId), artifactId); }
function getCaptureAnnotationPath(itemId: string, captureId: string) { return join(getCaptureDir(itemId, captureId), "annotation.json"); }
function getArtifactPath(itemId: string, artifactId: string) { return join(getArtifactDir(itemId, artifactId), "artifact.json"); }
function getCaptureScreenshotsDir(itemId: string, captureId: string) { return join(getCaptureDir(itemId, captureId), "screenshots"); }

// ── Init ───────────────────────────────────────────────────────────────────

function ensureDirs() {
  mkdirSync(getDataDir(), { recursive: true });
  mkdirSync(getContentDir(), { recursive: true });
  mkdirSync(getItemsDir(), { recursive: true });

  if (!existsSync(getIndexPath()) && !existsSync(getLegacyIndexPath())) {
    writeFileSync(getIndexPath(), "[]", "utf-8");
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizeTag(tag: string): string | null {
  const value = tag.trim();
  return value ? value : null;
}

function mergeTags(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const group of groups) {
    for (const tag of group || []) {
      const normalized = normalizeTag(tag);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
}

function canonicalizeSource(type: Item["type"], source: string): string {
  if (type !== "url") return source;

  try {
    const url = new URL(source);
    url.hash = "";
    return url.toString();
  } catch {
    return source;
  }
}

function buildFrontmatter(item: Item): string {
  return [
    "---",
    `id: ${item.id}`,
    `source: ${item.source}`,
    item.canonicalSource ? `canonicalSource: ${item.canonicalSource}` : null,
    `title: "${item.title.replace(/"/g, '\\"')}"`,
    `savedAt: ${item.savedAt}`,
    item.updatedAt ? `updatedAt: ${item.updatedAt}` : null,
    item.tags.length ? `tags: [${item.tags.join(", ")}]` : null,
    "---",
    "",
  ].filter(Boolean).join("\n");
}

function writePageMetadata(item: Item) {
  mkdirSync(getItemDir(item.id), { recursive: true });
  mkdirSync(getCaptureRoot(item.id), { recursive: true });
  mkdirSync(getArtifactRoot(item.id), { recursive: true });
  writeFileSync(getItemMetaPath(item.id), JSON.stringify({ ...item, layout: "page" }, null, 2), "utf-8");
}

function writePageSource(item: Item, markdown: string) {
  mkdirSync(getItemDir(item.id), { recursive: true });
  writeFileSync(getItemSourcePath(item.id), buildFrontmatter(item) + markdown, "utf-8");
}

function legacyContentPath(item: Item): string | null {
  return item.file ? join(getContentDir(), item.file) : null;
}

function legacyExtractionPath(item: Item): string {
  return join(getContentDir(), `${item.id}.extraction.md`);
}

function materializeItemDir(item: Item) {
  mkdirSync(getItemDir(item.id), { recursive: true });
  mkdirSync(getCaptureRoot(item.id), { recursive: true });
  mkdirSync(getArtifactRoot(item.id), { recursive: true });

  const sourcePath = getItemSourcePath(item.id);
  if (!existsSync(sourcePath)) {
    const legacyPath = legacyContentPath(item);
    if (legacyPath && existsSync(legacyPath)) copyFileSync(legacyPath, sourcePath);
  }

  const extractionPath = getItemExtractionPath(item.id);
  const legacyExtraction = legacyExtractionPath(item);
  if (!existsSync(extractionPath) && existsSync(legacyExtraction)) {
    copyFileSync(legacyExtraction, extractionPath);
  }

  writePageMetadata({ ...item, layout: "page" });
}

function findItemIndex(items: Item[], id: string) {
  return items.findIndex((item) => item.id === id);
}

function orderItems(items: Item[]): Item[] {
  return [...items].sort((left, right) => {
    const l = left.updatedAt || left.savedAt;
    const r = right.updatedAt || right.savedAt;
    return r.localeCompare(l);
  });
}

function parseScreenshotDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Screenshot payload must be a base64 data URL.");
  return {
    mimeType: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function saveCaptureScreenshots(itemId: string, captureId: string, screenshots: string[] = [], fullPageScreenshot?: string): CaptureScreenshot[] {
  const dir = getCaptureScreenshotsDir(itemId, captureId);
  mkdirSync(dir, { recursive: true });

  const saved: CaptureScreenshot[] = screenshots.map((dataUrl, index) => {
    const { mimeType, buffer } = parseScreenshotDataUrl(dataUrl);
    const filePath = join(dir, `el-${index + 1}.${extensionForMimeType(mimeType)}`);
    writeFileSync(filePath, buffer);
    return {
      id: `${captureId}:el:${index + 1}`,
      type: "element",
      elementIndex: index + 1,
      path: filePath,
    };
  });

  if (fullPageScreenshot) {
    const { mimeType, buffer } = parseScreenshotDataUrl(fullPageScreenshot);
    const filePath = join(dir, `full.${extensionForMimeType(mimeType)}`);
    writeFileSync(filePath, buffer);
    saved.push({
      id: `${captureId}:full`,
      type: "full-page",
      path: filePath,
    });
  }

  return saved;
}

function normalizeTextList(values?: string[]): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : undefined;
}

function buildTwitterArtifactData(input: TwitterArtifactData | undefined): TwitterArtifactData | undefined {
  if (!input) return undefined;

  const media = Array.isArray(input.media)
    ? input.media
        .filter((entry) => entry && typeof entry.url === "string" && entry.url.trim())
        .map((entry) => ({
          type: entry.type,
          url: entry.url.trim(),
          ...(typeof entry.previewUrl === "string" && entry.previewUrl.trim() ? { previewUrl: entry.previewUrl.trim() } : {}),
          ...(typeof entry.altText === "string" && entry.altText.trim() ? { altText: entry.altText.trim() } : {}),
        }))
    : undefined;

  const source = input.source
    ? {
        mode: input.source.mode,
        ...(typeof input.source.pageUrl === "string" && input.source.pageUrl.trim() ? { pageUrl: input.source.pageUrl.trim() } : {}),
        ...(typeof input.source.capturedAt === "string" && input.source.capturedAt.trim() ? { capturedAt: input.source.capturedAt.trim() } : {}),
      }
    : undefined;

  return {
    ...(typeof input.url === "string" && input.url.trim() ? { url: input.url.trim() } : {}),
    ...(typeof input.tweetId === "string" && input.tweetId.trim() ? { tweetId: input.tweetId.trim() } : {}),
    ...(typeof input.authorHandle === "string" && input.authorHandle.trim() ? { authorHandle: input.authorHandle.trim() } : {}),
    ...(typeof input.authorName === "string" && input.authorName.trim() ? { authorName: input.authorName.trim() } : {}),
    ...(typeof input.text === "string" && input.text.trim() ? { text: input.text.trim() } : {}),
    ...(typeof input.createdAt === "string" && input.createdAt.trim() ? { createdAt: input.createdAt.trim() } : {}),
    ...(typeof input.bookmarkedAt === "string" && input.bookmarkedAt.trim() ? { bookmarkedAt: input.bookmarkedAt.trim() } : {}),
    ...(typeof input.conversationId === "string" && input.conversationId.trim() ? { conversationId: input.conversationId.trim() } : {}),
    ...(typeof input.inReplyToTweetId === "string" && input.inReplyToTweetId.trim() ? { inReplyToTweetId: input.inReplyToTweetId.trim() } : {}),
    ...(typeof input.quotedTweetId === "string" && input.quotedTweetId.trim() ? { quotedTweetId: input.quotedTweetId.trim() } : {}),
    ...(input.captureKind ? { captureKind: input.captureKind } : {}),
    ...(typeof input.pageTitle === "string" && input.pageTitle.trim() ? { pageTitle: input.pageTitle.trim() } : {}),
    ...(normalizeTextList(input.hashtags) ? { hashtags: normalizeTextList(input.hashtags) } : {}),
    ...(normalizeTextList(input.mentions) ? { mentions: normalizeTextList(input.mentions) } : {}),
    ...(normalizeTextList(input.urls) ? { urls: normalizeTextList(input.urls) } : {}),
    ...(media?.length ? { media } : {}),
    ...(normalizeTextList(input.threadTweetIds) ? { threadTweetIds: normalizeTextList(input.threadTweetIds) } : {}),
    ...(source ? { source } : {}),
    ...(input.raw !== undefined ? { raw: input.raw } : {}),
  };
}

function summarizeTwitterArtifact(data: TwitterArtifactData | undefined): { title: string; summary: string; searchableText: string } {
  const author = data?.authorHandle || data?.authorName || "twitter";
  const tweetId = data?.tweetId || "tweet";
  const text = data?.text?.trim();
  const title = text
    ? `${author}: ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`
    : `${author} · ${tweetId}`;
  const parts = [
    data?.captureKind ? `kind: ${data.captureKind}` : null,
    data?.authorName ? `author: ${data.authorName}` : null,
    data?.authorHandle ? `handle: ${data.authorHandle}` : null,
    data?.tweetId ? `tweetId: ${data.tweetId}` : null,
    text || null,
    data?.hashtags?.length ? `hashtags: ${data.hashtags.join(" ")}` : null,
    data?.mentions?.length ? `mentions: ${data.mentions.join(" ")}` : null,
    data?.urls?.length ? `urls: ${data.urls.join(" ")}` : null,
    data?.media?.length ? `media: ${data.media.map((entry) => entry.url).join(" ")}` : null,
  ].filter(Boolean);
  const summary = parts.join("\n");
  return {
    title,
    summary,
    searchableText: [title, summary].filter(Boolean).join("\n"),
  };
}

function makeSnippet(content: string, query: string): string {
  const lower = content.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return content.slice(0, 160).trim();
  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + query.length + 80);
  return "..." + content.slice(start, end).trim() + "...";
}

// ── Index CRUD ─────────────────────────────────────────────────────────────

export function loadIndex(): Item[] {
  ensureDirs();
  const path = existsSync(getIndexPath()) ? getIndexPath() : getLegacyIndexPath();
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf-8"));
  const rawItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
      ? parsed.items
      : [];
  const items = rawItems.map((item: any) => {
    if (item && item.type) return item as Item;
    return {
      id: item.id,
      type: item.url ? "url" : "note",
      source: item.source || item.url || "note",
      canonicalSource: item.canonicalSource || item.canonicalUrl || item.source || item.url || "note",
      title: item.title || item.id || "Untitled",
      tags: Array.isArray(item.tags) ? item.tags : [],
      savedAt: item.savedAt || item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      extracted: Boolean(item.extracted ?? item.hasExtraction),
      captureCount: item.captureCount || 0,
      latestCaptureId: item.latestCaptureId,
      latestCaptureAt: item.latestCaptureAt,
      artifactCount: item.artifactCount || 0,
      latestArtifactId: item.latestArtifactId,
      latestArtifactAt: item.latestArtifactAt,
      artifactTypes: Array.isArray(item.artifactTypes) ? item.artifactTypes : [],
      layout: item.layout || "page",
      strategy: item.strategy,
      file: item.file,
    } satisfies Item;
  });
  return orderItems(items);
}

function saveIndex(items: Item[]) {
  ensureDirs();
  const ordered = orderItems(items);
  const payload = JSON.stringify(ordered, null, 2);
  writeFileSync(getIndexPath(), payload, "utf-8");
  writeFileSync(getLegacyIndexPath(), payload, "utf-8");
}

// ── Public API ─────────────────────────────────────────────────────────────

export function addItem(opts: {
  type: Item["type"];
  source: string;
  title: string;
  markdown: string;
  tags?: string[];
  strategy?: string;
}): Item {
  const items = loadIndex();
  const now = new Date().toISOString();
  const canonicalSource = canonicalizeSource(opts.type, opts.source);

  const existing = opts.type === "url"
    ? items.find((item) => item.type === "url" && (item.canonicalSource || canonicalizeSource("url", item.source)) === canonicalSource)
    : undefined;

  const item: Item = existing
    ? {
        ...existing,
        source: opts.source,
        canonicalSource,
        title: opts.title,
        tags: mergeTags(existing.tags, opts.tags),
        updatedAt: now,
        strategy: opts.strategy || existing.strategy,
        layout: "page",
      }
    : {
        id: nanoid(10),
        type: opts.type,
        source: opts.source,
        canonicalSource,
        title: opts.title,
        tags: mergeTags(opts.tags),
        savedAt: now,
        updatedAt: now,
        strategy: opts.strategy,
        extracted: false,
        captureCount: 0,
        layout: "page",
      };

  materializeItemDir(item);
  writePageSource(item, opts.markdown);
  writePageMetadata(item);

  const next = items.filter((candidate) => candidate.id !== item.id);
  next.unshift(item);
  saveIndex(next);
  return item;
}

export function getItem(id: string): Item | undefined {
  return loadIndex().find(i => i.id === id);
}

export function findItemBySource(opts: {
  type?: Item["type"];
  source: string;
}): Item | undefined {
  const type = opts.type || "url";
  const canonical = canonicalizeSource(type, opts.source);
  return loadIndex().find((item) => {
    if (item.type !== type) return false;
    return (item.canonicalSource || canonicalizeSource(item.type, item.source)) === canonical;
  });
}

export function readContent(id: string): string | null {
  const item = getItem(id);
  if (!item) return null;
  const pagePath = getItemSourcePath(id);
  if (existsSync(pagePath)) return readFileSync(pagePath, "utf-8");

  const path = legacyContentPath(item);
  if (path && existsSync(path)) return readFileSync(path, "utf-8");
  return null;
}

export function listItems(opts?: {
  query?: string;
  tag?: string;
  type?: string;
  limit?: number;
  hasCaptures?: boolean;
}): Item[] {
  let items = loadIndex();

  if (opts?.type) items = items.filter(i => i.type === opts.type);
  if (opts?.tag) items = items.filter(i => i.tags.includes(opts.tag!));
  if (opts?.hasCaptures) items = items.filter(i => (i.captureCount || 0) > 0);
  if (opts?.query) {
    const q = opts.query.toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.source.toLowerCase().includes(q) ||
      (i.canonicalSource || "").toLowerCase().includes(q),
    );
  }
  if (opts?.limit) items = items.slice(0, opts.limit);

  return items;
}

export function listCaptures(itemId: string): CaptureBundle[] {
  const item = getItem(itemId);
  if (!item) return [];

  const dir = getCaptureRoot(itemId);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .map((captureId) => readCapture(itemId, captureId))
    .filter((capture): capture is CaptureBundle => Boolean(capture))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export function readCapture(itemId: string, captureId: string): CaptureBundle | null {
  const path = getCaptureAnnotationPath(itemId, captureId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function listArtifacts(itemId: string): ItemArtifact[] {
  const item = getItem(itemId);
  if (!item) return [];

  const dir = getArtifactRoot(itemId);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .map((artifactId) => readArtifact(itemId, artifactId))
    .filter((artifact): artifact is ItemArtifact => Boolean(artifact))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function readArtifact(itemId: string, artifactId: string): ItemArtifact | null {
  const path = getArtifactPath(itemId, artifactId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function findArtifact(artifactId: string): { item: Item; artifact: ItemArtifact } | null {
  for (const item of loadIndex()) {
    const artifact = readArtifact(item.id, artifactId);
    if (artifact) return { item, artifact };
  }
  return null;
}

export function saveItemArtifact(itemId: string, input: SaveItemArtifactInput): ItemArtifact {
  const items = loadIndex();
  const itemIndex = findItemIndex(items, itemId);
  if (itemIndex === -1) throw new Error(`Item not found: ${itemId}`);

  const existing = items[itemIndex];
  const timestamp = new Date().toISOString();
  const artifactId = `art_${nanoid(10)}`;

  let artifact: ItemArtifact;

  switch (input.type) {
    case "twitter": {
      const twitter = buildTwitterArtifactData(input.twitter);
      const derived = summarizeTwitterArtifact(twitter);
      artifact = {
        id: artifactId,
        itemId,
        type: "twitter",
        title: input.title?.trim() || derived.title,
        tags: mergeTags(existing.tags, input.tags, ["twitter"]),
        createdAt: timestamp,
        updatedAt: timestamp,
        summary: derived.summary,
        searchableText: derived.searchableText,
        ...(twitter ? { twitter } : {}),
      };
      break;
    }
    default:
      throw new Error(`Unsupported artifact type: ${String((input as { type?: string }).type)}`);
  }

  mkdirSync(getArtifactDir(itemId, artifactId), { recursive: true });
  writeFileSync(getArtifactPath(itemId, artifactId), JSON.stringify(artifact, null, 2), "utf-8");

  const nextArtifactTypes = new Set(existing.artifactTypes || []);
  nextArtifactTypes.add(artifact.type);

  const updatedItem: Item = {
    ...existing,
    title: artifact.title || existing.title,
    source: artifact.twitter?.url || existing.source,
    canonicalSource: canonicalizeSource(existing.type, artifact.twitter?.url || existing.source),
    tags: mergeTags(existing.tags, input.tags, artifact.tags),
    updatedAt: timestamp,
    latestArtifactId: artifactId,
    latestArtifactAt: timestamp,
    artifactCount: (existing.artifactCount || 0) + 1,
    artifactTypes: [...nextArtifactTypes],
    layout: "page",
  };

  items[itemIndex] = updatedItem;
  saveIndex(items);
  writePageMetadata(updatedItem);

  return artifact;
}

export function findCapture(captureId: string): { item: Item; capture: CaptureBundle } | null {
  for (const item of loadIndex()) {
    const capture = readCapture(item.id, captureId);
    if (capture) return { item, capture };
  }
  return null;
}

export function saveCapture(itemId: string, input: SaveCaptureInput): CaptureBundle {
  const items = loadIndex();
  const itemIndex = findItemIndex(items, itemId);
  if (itemIndex === -1) throw new Error(`Item not found: ${itemId}`);

  const existing = items[itemIndex];
  const timestamp = new Date().toISOString();
  const captureId = `cap_${nanoid(10)}`;

  const screenshots = saveCaptureScreenshots(itemId, captureId, input.screenshots, input.fullPageScreenshot);
  const elements = input.elements.map((element, index) => normalizeCaptureElement(element, index + 1));
  for (const screenshot of screenshots) {
    if (screenshot.type !== "element" || screenshot.elementIndex === undefined) continue;
    const element = elements.find(candidate => candidate.index === screenshot.elementIndex);
    if (element && !element.screenshotPath) element.screenshotPath = screenshot.path;
  }

  const analyzed = analyzeCapture({
    title: input.title || existing.title,
    url: input.url || existing.source,
    mode: input.mode || "basic",
    elements,
    screenshots,
  });

  const capture: CaptureBundle = {
    id: captureId,
    itemId,
    timestamp,
    url: input.url || existing.source,
    title: input.title || existing.title,
    ...(input.context ? { context: input.context } : {}),
    mode: input.mode || "basic",
    viewport: normalizeViewport(input.viewport),
    elements,
    screenshots,
    summary: analyzed.summary,
    issues: analyzed.issues,
    recommendations: analyzed.recommendations,
    status: input.status || "open",
  };

  mkdirSync(getCaptureDir(itemId, captureId), { recursive: true });
  writeFileSync(getCaptureAnnotationPath(itemId, captureId), JSON.stringify(capture, null, 2), "utf-8");

  const updatedItem: Item = {
    ...existing,
    title: input.title || existing.title,
    source: input.url || existing.source,
    canonicalSource: canonicalizeSource(existing.type, input.url || existing.source),
    tags: mergeTags(existing.tags, input.tags),
    updatedAt: timestamp,
    latestCaptureId: captureId,
    latestCaptureAt: timestamp,
    captureCount: (existing.captureCount || 0) + 1,
    layout: "page",
  };

  items[itemIndex] = updatedItem;
  saveIndex(items);
  writePageMetadata(updatedItem);

  return capture;
}

export function readBundle(id: string): ItemBundle | null {
  const item = getItem(id);
  if (!item) return null;

  const content = readContent(id);
  const extraction = readExtraction(id);
  const captures = listCaptures(id);
  const artifacts = listArtifacts(id);
  return {
    item,
    content,
    ...(extraction ? { extraction } : {}),
    captures,
    artifacts,
  };
}

export function searchContent(query: string, limit = 20): SearchResult[] {
  const items = loadIndex();
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const item of items) {
    const documents: Array<{ type: SearchResult["matchType"]; text: string }> = [];
    const content = readContent(item.id);
    const extraction = readExtraction(item.id);
    if (content) documents.push({ type: "content", text: content });
    if (extraction) documents.push({ type: "extraction", text: extraction });
    for (const capture of listCaptures(item.id)) {
      documents.push({ type: "capture", text: searchableCaptureText(capture) });
    }
    for (const artifact of listArtifacts(item.id)) {
      documents.push({ type: "artifact", text: artifact.searchableText });
    }

    const match = documents.find((document) => document.text.toLowerCase().includes(q));
    if (!match && !item.title.toLowerCase().includes(q)) continue;

    results.push({
      ...item,
      snippet: match ? makeSnippet(match.text, query) : item.title,
      ...(match ? { matchType: match.type } : {}),
    });

    if (results.length >= limit) break;
  }

  return results;
}

// ── Extraction Storage ─────────────────────────────────────────────────────

export function saveExtraction(id: string, extraction: string, patterns: string[]): boolean {
  const items = loadIndex();
  const idx = findItemIndex(items, id);
  if (idx === -1) return false;

  const item = items[idx];
  materializeItemDir(item);
  writeFileSync(getItemExtractionPath(id), extraction, "utf-8");

  items[idx] = {
    ...item,
    extracted: true,
    extractedAt: new Date().toISOString(),
    extractionPatterns: patterns,
    updatedAt: new Date().toISOString(),
    layout: "page",
  };
  saveIndex(items);
  writePageMetadata(items[idx]);
  return true;
}

export function readExtraction(id: string): string | null {
  const item = getItem(id);
  if (!item) return null;

  const pagePath = getItemExtractionPath(id);
  if (existsSync(pagePath)) return readFileSync(pagePath, "utf-8");

  const legacyPath = legacyExtractionPath(item);
  if (existsSync(legacyPath)) return readFileSync(legacyPath, "utf-8");
  return null;
}

export function deleteItem(id: string): boolean {
  const items = loadIndex();
  const idx = findItemIndex(items, id);
  if (idx === -1) return false;

  const item = items[idx];
  const legacyContent = legacyContentPath(item);
  if (legacyContent && existsSync(legacyContent)) rmSync(legacyContent, { force: true });

  const legacyExtraction = legacyExtractionPath(item);
  if (existsSync(legacyExtraction)) rmSync(legacyExtraction, { force: true });

  rmSync(getItemDir(id), { recursive: true, force: true });

  items.splice(idx, 1);
  saveIndex(items);
  return true;
}

export function itemCount(): number {
  return loadIndex().length;
}

export function totalCaptureCount(): number {
  return loadIndex().reduce((sum, item) => sum + (item.captureCount || 0), 0);
}
