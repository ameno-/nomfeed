# MarkStash

Save anything as markdown. URLs, files, notes — converted and stored locally as `.md` files.

Built for AI coding agents. No database, no Docker, no daemon. Just files on disk.

## How It Works

```
Chrome Extension ──→ markstash serve ←── Coding Agents
                          │
                     markstash mcp
                          │
                     ~/.markstash/
                     ├── items.json      (metadata index)
                     └── content/
                         ├── abc123.md   (converted markdown)
                         └── def456.md
```

**URLs** → Fetched with `Accept: text/markdown` (Cloudflare Markdown for Agents), with Readability fallback  
**Files** → Converted via Microsoft's [markitdown](https://github.com/microsoft/markitdown) (PDF, DOCX, XLSX, images, etc.)  
**Notes** → Saved as-is

## Install

```bash
# Clone and link
cd markstash
bun install
bun link

# For file conversion (PDF, DOCX, etc.), install markitdown:
pip install 'markitdown[all]'
```

## CLI

```bash
# Save a URL
markstash add https://example.com/article

# Save a file (PDF, DOCX, XLSX, images...)
markstash add ./report.pdf --tags work,q4

# Save a note
markstash note "Remember to review the API docs"

# List saved items
markstash list
markstash list --tag work --json

# Read content
markstash read abc123

# Search across all content
markstash search "machine learning"

# Delete
markstash delete abc123

# Show stats
markstash status
```

Every command supports `--json` for machine-readable output.

## MCP Server

```bash
markstash mcp
```

Exposes tools over stdio: `markstash_add`, `markstash_list`, `markstash_read`, `markstash_search`, `markstash_delete`, `markstash_status`.

### Claude Desktop / Cursor Config

```json
{
  "mcpServers": {
    "markstash": {
      "command": "bun",
      "args": ["run", "/path/to/markstash/src/cli.ts", "mcp"]
    }
  }
}
```

## Chrome Extension

1. Run `markstash serve` (keeps a local HTTP server on port 24242)
2. Open `chrome://extensions`, enable Developer Mode
3. Click "Load unpacked" → select the `extension/` folder
4. Click the MarkStash icon or right-click → "Save to MarkStash"

## HTTP API (for extension)

```bash
markstash serve --port 24242
```

| Method | Path | Description |
|--------|------|-------------|
| POST | `/add` | `{ url, title?, tags?, selection? }` or `{ file }` or `{ note }` |
| GET | `/items` | List items `?query=&tag=&type=&limit=` |
| GET | `/items/:id` | Read item + content |
| DELETE | `/items/:id` | Delete item |
| GET | `/search?q=` | Full-text search |
| GET | `/health` | Health check |

## Storage

Everything lives in `~/.markstash/` (override with `MARKSTASH_DIR` env var).

- `items.json` — flat JSON array of metadata
- `content/*.md` — markdown files with YAML frontmatter

Each markdown file is self-contained:

```markdown
---
source: https://example.com/article
title: "Example Article"
savedAt: 2026-02-28T15:00:00Z
---

# Example Article

Content here...
```

## Dependencies

- **Bun** — runtime
- **@mozilla/readability** + **turndown** — HTML → Markdown fallback
- **@modelcontextprotocol/sdk** — MCP server
- **markitdown** (Python, optional) — file conversion (PDF, DOCX, etc.)
