# 🍴 NomFeed

**Nom the web. Feed your agents.**

NomFeed converts any URL, YouTube video, or file into clean, structured markdown — and keeps it in a searchable local library. One CLI command to save. One command to search. Optional LLM extraction turns content into structured intelligence.

```bash
nomfeed add https://example.com/article          # URL → markdown
nomfeed add https://youtube.com/watch?v=xyz       # YouTube transcript
nomfeed add ./report.pdf                          # File → markdown
nomfeed search "transformers"                     # Full-text search
nomfeed read AMxTn2tS5_ --extract                 # Read LLM extraction
```

No database. No Docker. No daemon. Just `.md` files in `~/.nomfeed/`.

---

## How It Compares

NomFeed sits in the same space as [markdown.new](https://markdown.new) and [keep.md](https://keep.md) — tools that convert web content to markdown for AI consumption. We love what they've built. NomFeed takes a different approach:

| | **markdown.new** | **keep.md** | **NomFeed** |
|---|---|---|---|
| **What it does** | URL → markdown (single conversion) | Bookmark + markdown API | CLI library + extraction engine |
| **Storage** | None (stateless) | Cloud | Local flat files (`~/.nomfeed/`) |
| **YouTube** | ❌ | ❌ | ✅ Full transcript via yt-dlp |
| **File conversion** | ✅ 20+ formats | ❌ | ✅ PDF, DOCX, XLSX, code, images |
| **LLM extraction** | ❌ | ❌ | ✅ 6 patterns (wisdom, claims, chapters...) |
| **Search** | ❌ | ✅ API-based | ✅ Local full-text search |
| **MCP server** | ❌ | ✅ | ✅ 7 tools |
| **Chrome extension** | ❌ | ✅ | ✅ Popup + context menu |
| **Offline** | ❌ | ❌ | ✅ Everything local after save |
| **Data ownership** | N/A | Their servers | Your filesystem |
| **Cost** | Free | Free tier + paid | Free forever (BYO LLM key) |
| **URL strategies** | Cloudflare only | Unknown | 3-strategy cascade |

**markdown.new** is perfect when you need a quick one-off conversion. **keep.md** is great if you want a hosted API. **NomFeed** is for developers who want a local library they own, with search, extraction, and agent integration — all on their own machine.

---

## Install

```bash
git clone https://github.com/ameno-/nomfeed
cd nomfeed
bun install
bun link

# Optional: file conversion (PDF, DOCX, XLSX, images)
pip install 'markitdown[all]'

# Optional: YouTube transcript extraction
brew install yt-dlp

# Optional: LLM extraction (--extract flag)
export OPENROUTER_API_KEY=your-key  # get one at openrouter.ai/keys
```

## CLI

```bash
# Save content
nomfeed add <url>                    # URL → markdown
nomfeed add <url> --extract          # URL → markdown + LLM extraction
nomfeed add <file>                   # File → markdown
nomfeed note "some text"             # Quick note

# Retrieve
nomfeed list                         # List everything (✦ = has extraction)
nomfeed read <id>                    # Print markdown content
nomfeed read <id> --extract          # Print extraction only
nomfeed read <id> --full             # Print both
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

## URL Conversion

NomFeed uses a 3-strategy cascade — the first success wins:

1. **Cloudflare** `text/markdown` — native edge conversion, fastest
2. **Jina Reader** — renders JavaScript SPAs, returns clean markdown
3. **Readability** — universal fallback, extracts article content from raw HTML

This means NomFeed works on sites that break simpler tools: JS-heavy SPAs, paywalled articles (where possible), and pages that return empty HTML without rendering.

## LLM Extraction

When you add with `--extract`, NomFeed runs [Fabric](https://github.com/danielmiessler/Fabric)-inspired patterns against the content via LLM. Each pattern is a single focused API call — no agents, no orchestration, just reliable structured output.

| Pattern | What It Extracts |
|---|---|
| `extract_wisdom` | Ideas, insights, quotes, habits, facts, references, recommendations |
| `video_chapters` | Timestamped chapter outline |
| `analyze_claims` | Truth claims with evidence ratings (A–F) and logical fallacies |
| `extract_references` | Books, papers, tools, people mentioned |
| `summarize` | One-sentence summary + main points + takeaways |
| `rate_content` | Quality scores: surprise, novelty, insight, value, wisdom (0–10) |

```bash
# Default patterns: extract_wisdom + video_chapters
nomfeed add https://youtube.com/watch?v=xyz --extract

# Choose specific patterns
nomfeed extract <id> --patterns extract_wisdom,analyze_claims,rate_content

# Add your own
# Create ~/.nomfeed/patterns/<name>/system.md with your prompt
nomfeed patterns  # will show custom patterns
```

**Provider:** [OpenRouter](https://openrouter.ai) — one API key, access to all models.
**Default model chain:** Claude Sonnet 4.5 → Sonnet 4 → Haiku 4.5 (automatic fallback on rate limits/errors).

## MCP Server

```bash
nomfeed mcp  # starts stdio MCP server
```

**Tools:** `nomfeed_add`, `nomfeed_list`, `nomfeed_read` (content/extract/full), `nomfeed_search`, `nomfeed_extract`, `nomfeed_delete`, `nomfeed_status`

### Claude Desktop / Cursor / Windsurf Config

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

1. Run `nomfeed serve` (starts local HTTP server on port 24242)
2. `chrome://extensions` → Developer Mode → Load unpacked → select `extension/`
3. Click the NomFeed icon or right-click any page → "Save to NomFeed"

The extension supports tagging and optional extraction on save.

## HTTP API

```bash
nomfeed serve          # default port 24242
nomfeed serve --port 8080
```

| Method | Path | Description |
|---|---|---|
| `POST` | `/add` | Save URL, file, or note. `{ url, title?, tags?, extract? }` |
| `GET` | `/items` | List items. `?query=&tag=&type=&limit=` |
| `GET` | `/items/:id` | Get item metadata + content |
| `DELETE` | `/items/:id` | Delete item |
| `GET` | `/search?q=` | Full-text search |
| `GET` | `/health` | Health check |

## Storage

Everything lives in `~/.nomfeed/` (override with `NOMFEED_DIR`):

```
~/.nomfeed/
├── items.json              # metadata index (array of items)
└── content/
    ├── abc123.md           # converted markdown
    ├── abc123.extraction.md # LLM extraction (if extracted)
    └── def456.md
```

Each `.md` file includes YAML frontmatter with source, title, and timestamp. Files are self-contained — you can copy them anywhere and they still make sense.

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `OPENROUTER_API_KEY` | LLM access for `--extract` | Only for extraction |
| `NOMFEED_MODEL` | Override default model | No |
| `NOMFEED_DIR` | Override data directory | No (default: `~/.nomfeed`) |

## Agent Skill

NomFeed ships with a [Pi](https://github.com/badlogic/pi-coding-agent) / [Agent Skills](https://agentskills.io) compatible skill in `skills/nomfeed/`. Install it so your coding agent can save, search, and extract content on your behalf.

### Install the skill

```bash
# Copy to your global skills directory
cp -r skills/nomfeed ~/.pi/agent/skills/nomfeed

# Or symlink it (stays in sync with repo updates)
ln -sf "$(pwd)/skills/nomfeed" ~/.pi/agent/skills/nomfeed
```

The skill is also compatible with other harnesses that support the Agent Skills standard:

```bash
# Claude Code
cp -r skills/nomfeed ~/.claude/skills/nomfeed

# Codex
cp -r skills/nomfeed ~/.codex/skills/nomfeed
```

Once installed, your agent will automatically trigger NomFeed on phrases like *"save this URL"*, *"bookmark this"*, *"search my saved content"*, *"extract insights from this video"*, etc.

## Architecture

See [DESIGN.md](DESIGN.md) for the full system architecture, conversion strategies, extraction pipeline, and design decisions.

## License

[MIT](LICENSE)
