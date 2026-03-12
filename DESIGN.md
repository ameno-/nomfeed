# NomFeed — Architecture & Design

## Overview

NomFeed is a local-first CLI tool that converts URLs, YouTube videos, and files into clean markdown. It now uses a page-centric flat-file layout: each page item owns its source markdown, optional extraction, and any annotation captures. There is still no database, Docker, or daemon process.

## System Architecture

```
                    ┌──────────────────────┐
                    │  Chrome Extension    │
                    │ launcher + popup     │
                    └────────┬─────────────┘
                             │ POST /add
                             │ POST /items/:id/captures
                             ▼
┌─────────┐    ┌──────────────────────┐    ┌──────────────┐
│  CLI    │───▶│    HTTP Server       │    │  MCP Server  │
│ (Bun)  │    │  (port 24242)        │    │  (stdio)     │
└────┬────┘    └──────────┬───────────┘    └──────┬───────┘
     │                    │                        │
     ▼                    ▼                        ▼
┌────────────────────────────────────────────────────────┐
│                     Core Functions                      │
│  store.ts │ convert.ts │ youtube.ts │ extract.ts │ llm │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  ~/.nomfeed/ │
                  │  ├ index.json│
                  │  ├ items/    │
                  │  │  └ id/    │
                  │  │    ├ source.md
                  │  │    ├ extraction.md
                  │  │    └ captures/
                  │  └ content/  │
                  └──────────────┘
```

## Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/cli.ts` | CLI entry point, arg parsing, all commands | Main interface |
| `src/store.ts` | Page-centric flat-file storage + legacy compatibility | Data layer |
| `src/convert.ts` | URL → markdown (3-strategy cascade) | Fetch layer |
| `src/youtube.ts` | YouTube → markdown via yt-dlp + VTT parsing | Fetch layer |
| `src/extract.ts` | LLM extraction orchestrator (parallel patterns) | Intelligence |
| `src/patterns.ts` | Fabric-inspired extraction pattern definitions | Intelligence |
| `src/llm.ts` | OpenRouter API client with model fallback chain | Intelligence |
| `src/server.ts` | HTTP API server (Bun.serve) | Interface |
| `src/mcp.ts` | Model Context Protocol server (stdio) | Interface |
| `src/capture.ts` | Capture types, normalization, and capture analysis | Capture layer |

## URL Conversion Strategy

NomFeed uses a 3-strategy cascade to convert URLs to markdown. Each strategy is tried in order; the first success wins.

```
URL ──▶ Strategy 1: Cloudflare text/markdown
        (native markdown via Accept header)
            │ fail?
            ▼
        Strategy 2: Jina Reader
        (r.jina.ai renders JS, returns markdown)
            │ fail?
            ▼
        Strategy 3: Readability
        (fetch HTML, extract with Readability, convert to markdown)
```

**Why three?** Cloudflare is fastest and cleanest but only works on CF-enabled sites. Jina handles JS-heavy SPAs that return empty HTML without rendering. Readability is the universal fallback that works on almost anything but produces lower-quality markdown.

## YouTube Ingestion

YouTube URLs are detected and routed to a dedicated pipeline:

1. **yt-dlp** extracts video metadata (title, description, duration, channel)
2. **yt-dlp** downloads the VTT subtitle file (auto-generated or manual)
3. VTT is parsed into timestamped transcript sections
4. Metadata + transcript are composed into a structured markdown document

No YouTube API key required. Works on any video with available subtitles.

## LLM Extraction

When `--extract` is passed, content goes through the extraction pipeline after being saved:

1. Content is read from the stored `.md` file
2. Selected patterns (default: `extract_wisdom` + `video_chapters`) are run **in parallel**
3. Each pattern = one LLM API call with a focused system prompt
4. Results are concatenated and saved as `{id}.extraction.md` alongside the content file
5. Item metadata is updated: `extracted: true`, `extractedAt`, `extractionPatterns`

**Provider:** OpenRouter (single API key → access to all models)
**Default model chain:** Claude Sonnet 4.5 → Sonnet 4 → Haiku 4.5 (automatic fallback)

### Built-in Patterns

| Pattern | System Prompt Focus |
|---------|-------------------|
| `extract_wisdom` | Ideas, insights, quotes, habits, facts, references, recommendations |
| `video_chapters` | Timestamped chapter outline from transcript |
| `analyze_claims` | Truth claims with evidence ratings (A–F), logical fallacies |
| `extract_references` | Books, papers, tools, people, projects mentioned |
| `summarize` | One-sentence summary + main points + takeaways |
| `rate_content` | Quality scores: surprise, novelty, insight, value, wisdom (0–10) |

Custom patterns: add `~/.nomfeed/patterns/<name>/system.md`

## Storage Format

```text
~/.nomfeed/
├── index.json                    # Array of Item metadata
├── items.json                    # Legacy-compatible mirror
├── items/
│   └── {id}/
│       ├── item.json             # Page metadata
│       ├── source.md             # Converted markdown content
│       ├── extraction.md         # LLM extraction output (optional)
│       └── captures/
│           └── {captureId}/
│               ├── annotation.json
│               └── screenshots/
└── content/                      # Legacy flat-file content (readable, not canonical)
```

### Item Schema

```typescript
interface Item {
  id: string;              // nanoid, 10 chars
  type: 'url' | 'file' | 'note';
  title: string;
  source: string;          // URL, file path, or "note"
  canonicalSource?: string;
  tags: string[];
  strategy?: string;       // cloudflare | jina | readability | yt-dlp | markitdown
  savedAt: string;         // ISO 8601
  updatedAt?: string;
  extracted?: boolean;
  extractedAt?: string;
  extractionPatterns?: string[];
  captureCount?: number;
  latestCaptureId?: string;
}
```

### Content Files

Each `source.md` file is self-contained with YAML frontmatter:

```markdown
---
source: https://example.com/article
title: "Example Article"
savedAt: 2026-02-28T15:00:00Z
---

# Article Title

Content here...
```

## HTTP API

The server (`nomfeed serve`) exposes a simple REST API on port 24242:

| Method | Path | Body / Params | Response |
|--------|------|---------------|----------|
| POST | `/add` | `{ url, title?, tags?, extract?, capture? }` | Item + `{ extracting? }` |
| GET | `/items` | `?query=&tag=&type=&limit=&hasCaptures=1` | Item[] |
| GET | `/items/:id` | — | Item + content |
| GET | `/items/:id/bundle` | — | Item + content + extraction + captures |
| GET | `/items/:id/captures` | — | Capture[] |
| POST | `/items/:id/captures` | capture payload | Capture |
| GET | `/captures/:id` | — | Capture + parent item |
| DELETE | `/items/:id` | — | `{ deleted }` |
| GET | `/search?q=` | — | SearchResult[] |
| GET | `/health` | — | `{ ok }` |

When `extract: true` is passed to POST `/add`, the server saves the item immediately and returns, then runs extraction asynchronously in the background. This prevents Chrome's 30-second service worker timeout from killing extraction.

## MCP Server

`nomfeed mcp` starts a Model Context Protocol server over stdio. Tools:

- `nomfeed_add` — Save URL or file path
- `nomfeed_list` — List items with optional filters
- `nomfeed_read` — Read content (modes: content, extract, full, captures, bundle)
- `nomfeed_search` — Full-text search
- `nomfeed_extract` — Run extraction on existing item
- `nomfeed_delete` — Delete item
- `nomfeed_status` — Library stats

## Chrome Extension

Manifest V3 extension with:
- **Popup:** Remote control for page tools, save actions, and extraction defaults
- **Injected page deck:** floating launcher + command deck on each normal page
- **Injected annotator:** in-page capture tray for element annotations
- **Context menu:** Right-click → "Save to NomFeed"
- **Background service worker:** Handles save requests via POST to local server

The extension remains a thin client. NomFeed still owns canonical storage and bundle assembly; the extension only triggers saves and captures.

## Design Decisions

1. **Flat files over database** — JSON + markdown is inspectable, diffable, portable. No migration headaches, no schema versions. `cat` and `grep` work out of the box.

2. **3-strategy URL cascade** — No single strategy works for all URLs. The cascade gives us reliability without complexity.

3. **OpenRouter as single LLM provider** — One API key, access to all models. Automatic fallback handles rate limits and model outages.

4. **Dumb pipe extraction** — Each pattern = one focused API call. No orchestrator, no chain-of-thought, no agents. Simple is reliable.

5. **Grouped page artifacts** — `items/<id>/` keeps source, extraction, and captures together while staying inspectable.

6. **Async server extraction** — Server returns immediately after save, runs LLM in background. Prevents timeout issues with slow models.

7. **Legacy readability** — Existing flat content files remain readable so migration can be incremental rather than destructive.
