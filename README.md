# 🍴 NomFeed

**Nom the web. Feed your agents.**

NomFeed converts any URL, YouTube video, file, or note into clean, structured markdown — ready for AI coding agents to consume. One CLI command, one Chrome extension click.

```bash
nomfeed add https://example.com/article          # Save URL as markdown
nomfeed add https://youtube.com/watch?v=xyz       # Extract YouTube transcript
nomfeed add https://youtube.com/watch?v=xyz --extract  # + LLM wisdom extraction
nomfeed add ./report.pdf                          # Convert file to markdown
nomfeed search "transformers"                     # Full-text search your library
```

## Why NomFeed?

Your AI agents are starving for context. You have 200 tabs open, a pile of PDFs, and hours of YouTube talks you'll "watch later." NomFeed turns all of it into markdown that any agent can search and read.

- **URLs** → Markdown via Cloudflare `text/markdown`, Jina Reader (renders JS), or Readability
- **YouTube** → Full timestamped transcript via yt-dlp + optional LLM extraction (ideas, insights, quotes, claims)
- **Files** → PDF, DOCX, XLSX, images, code via Microsoft's [markitdown](https://github.com/microsoft/markitdown)
- **Notes** → Quick text saved as-is

No database. No Docker. No daemon. Just `.md` files in `~/.nomfeed/`.

## Install

```bash
git clone https://github.com/ameno-/nomfeed
cd nomfeed
bun install
bun link

# Optional: file conversion (PDF, DOCX, etc.)
pip install 'markitdown[all]'

# Optional: YouTube transcript extraction
brew install yt-dlp

# Optional: LLM extraction (--extract flag)
export OPENROUTER_API_KEY=your-key  # get at openrouter.ai/keys
```

## CLI

```bash
# Save content
nomfeed add <url>                    # URL → markdown
nomfeed add <url> --extract          # URL → markdown + LLM extraction
nomfeed add <file>                   # File → markdown
nomfeed note "some text"             # Quick note

# Retrieve
nomfeed list                         # List everything
nomfeed list --tag work              # Filter by tag
nomfeed read <id>                    # Print markdown content
nomfeed search "query"               # Full-text search

# Extract
nomfeed extract <id>                 # Run extraction on existing item
nomfeed extract <id> --patterns summarize,analyze_claims
nomfeed patterns                     # List available patterns

# Manage
nomfeed delete <id>
nomfeed status
```

Every command supports `--json` for machine-readable output.

## LLM Extraction

When you add content with `--extract`, NomFeed runs [Fabric](https://github.com/danielmiessler/Fabric)-inspired patterns against the content via LLM. Instead of a simple summary, you get multi-dimensional structured extraction:

| Pattern | What It Extracts |
|---|---|
| `extract_wisdom` | Ideas, insights, quotes, habits, facts, references, recommendations |
| `video_chapters` | Timestamped chapter outline |
| `analyze_claims` | Truth claims with evidence ratings (A–F) |
| `extract_references` | Books, papers, tools, people mentioned |
| `summarize` | One-sentence summary + main points + takeaways |
| `rate_content` | Quality score: surprise, novelty, insight, value, wisdom |

```bash
# Default: extract_wisdom + video_chapters
nomfeed add https://youtube.com/watch?v=xyz --extract

# Specific patterns
nomfeed add https://youtube.com/watch?v=xyz --extract --patterns extract_wisdom,analyze_claims,rate_content

# Custom patterns: add your own in ~/.nomfeed/patterns/<name>/system.md
```

**Provider:** [OpenRouter](https://openrouter.ai) (one API key, access to all models)
**Default model:** Claude Sonnet 4.5 → Sonnet 4 → Haiku 4.5 (automatic fallback)

## MCP Server

```bash
nomfeed mcp
```

Tools: `nomfeed_add`, `nomfeed_list`, `nomfeed_read`, `nomfeed_search`, `nomfeed_delete`, `nomfeed_extract`, `nomfeed_status`

### Claude Desktop / Cursor Config

```json
{
  "mcpServers": {
    "nomfeed": {
      "command": "bun",
      "args": ["run", "/path/to/nomfeed/src/cli.ts", "mcp"]
    }
  }
}
```

## Chrome Extension

1. Run `nomfeed serve` (local HTTP server on port 24242)
2. Go to `chrome://extensions` → Developer Mode → Load unpacked → select `extension/`
3. Click the NomFeed icon or right-click → "Save to NomFeed"

## HTTP API

```bash
nomfeed serve --port 24242
```

| Method | Path | Description |
|---|---|---|
| `POST` | `/add` | `{ url, title?, tags? }` or `{ file }` or `{ note }` |
| `GET` | `/items` | List items `?query=&tag=&type=&limit=` |
| `GET` | `/items/:id` | Read item + content |
| `DELETE` | `/items/:id` | Delete item |
| `GET` | `/search?q=` | Full-text search |
| `GET` | `/health` | Health check |

## Storage

Everything in `~/.nomfeed/` (override with `NOMFEED_DIR`):

```
~/.nomfeed/
├── items.json          # metadata index
├── content/            # markdown files
│   ├── abc123.md
│   └── def456.md
└── patterns/           # custom extraction patterns (optional)
    └── my_pattern/
        └── system.md
```

Each `.md` file is self-contained with YAML frontmatter:

```markdown
---
source: https://example.com/article
title: "Example Article"
savedAt: 2026-02-28T15:00:00Z
---

# Example Article

Content here...
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `OPENROUTER_API_KEY` | LLM access for `--extract` | Only for extraction |
| `NOMFEED_MODEL` | Override default model | No (default: claude-sonnet-4.5) |
| `NOMFEED_DIR` | Override data directory | No (default: ~/.nomfeed) |

## License

MIT
