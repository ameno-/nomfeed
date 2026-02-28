# MarkStash — Design Document

## What It Is

A dead-simple bookmark/file manager that converts everything to Markdown.
URLs become markdown via Cloudflare's `Accept: text/markdown` (with fallback to Readability).
Files become markdown via Microsoft's `markitdown`.
Everything is stored locally as `.md` files in a flat directory.

## Architecture

```
Chrome Extension ──→ CLI (TypeScript/Bun) ←── Coding Agents
                          │
                     MCP Server
                          │
                     ~/.markstash/
                     ├── items.json        (metadata index)
                     └── content/
                         ├── abc123.md     (converted markdown)
                         └── def456.md
```

## Principles

1. **Files on disk** — No database. JSON index + markdown files.
2. **One dependency for files** — Python's `markitdown` for file conversion.
3. **One dependency for URLs** — `Accept: text/markdown` header + Readability fallback.
4. **CLI-first** — Every operation is a CLI command that returns JSON.
5. **MCP second** — Thin wrapper over CLI functions.
6. **Chrome extension third** — POST to local HTTP endpoint.

## Components

### 1. CLI (`markstash`)
- `markstash add <url>` — Fetch URL as markdown, save
- `markstash add <file>` — Convert file via markitdown, save  
- `markstash list [--query <q>]` — List saved items
- `markstash read <id>` — Output markdown content
- `markstash search <query>` — Full-text search across all content
- `markstash delete <id>` — Remove item
- `markstash serve` — Start local HTTP server (for Chrome extension)
- `markstash mcp` — Start MCP server (stdio)

### 2. MCP Server
Tools:
- `markstash_add` — Save URL or file path
- `markstash_list` — List items  
- `markstash_read` — Read content
- `markstash_search` — Search content
- `markstash_delete` — Delete item

### 3. Chrome Extension
- Browser action: click to save current tab
- Context menu: right-click "Save to MarkStash"
- Sends URL + page title + selection to `markstash serve` endpoint

### 4. Local HTTP Server (for extension)
- `POST /add` — `{ url, title?, selection? }`
- `GET /items` — List all items
- `GET /items/:id` — Read item content
- `DELETE /items/:id` — Delete item

## Storage Format

`~/.markstash/items.json`:
```json
[
  {
    "id": "abc123",
    "type": "url",
    "source": "https://example.com/article",
    "title": "Example Article", 
    "tags": [],
    "savedAt": "2026-02-28T15:00:00Z",
    "file": "abc123.md"
  }
]
```

Each `.md` file in `content/` is pure markdown with a YAML frontmatter header:
```markdown
---
source: https://example.com/article
title: Example Article
savedAt: 2026-02-28T15:00:00Z
---

# Example Article

Content here...
```

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **URL → MD**: fetch with `Accept: text/markdown`, fallback to @mozilla/readability + turndown
- **File → MD**: Python `markitdown` (shelled out)
- **MCP**: `@modelcontextprotocol/sdk`
- **Chrome Extension**: Manifest V3, vanilla JS
- **Search**: Simple substring/regex over markdown files (no index needed for <10k items)
