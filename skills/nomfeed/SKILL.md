---
name: nomfeed
description: >
  Local-first CLI tool that converts URLs, YouTube videos, and files into clean markdown
  and stores them in a searchable local library with optional LLM extraction.
  Trigger on: "save this URL", "bookmark this", "add to my library", "search my saved content",
  "what do I have about X", "extract insights from", "save this YouTube video",
  "convert this file to markdown", "quick note", "save this page".
allowed-tools: Bash
metadata:
  data_dir: ~/.nomfeed
  http_port: 24242
  extraction_patterns:
    - extract_wisdom
    - video_chapters
    - analyze_claims
    - extract_references
    - summarize
    - rate_content
---

# NomFeed — Local-first Content Library

## Quick Start

```bash
nomfeed add <url>                    # Save URL as markdown (Cloudflare → Jina → Readability cascade)
nomfeed add <youtube-url> --extract  # YouTube transcript + LLM extraction
nomfeed add <file>                   # File conversion via markitdown
nomfeed note "text"                  # Quick notes
nomfeed list                         # See library (✦ = has extraction)
nomfeed read <id>                    # Read content
nomfeed search "query"               # Full-text search
```

All commands accept `--json` for structured output.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | LLM API key for extraction | (required for extraction) |
| `NOMFEED_DIR` | Override data directory | `~/.nomfeed` |
| `NOMFEED_MODEL` | Override extraction model | `anthropic/claude-sonnet-4.5` (fallback: sonnet-4 → haiku-4.5) |

---

## Data Storage

```
~/.nomfeed/
├── items.json              # Item metadata (array)
├── content/
│   ├── <id>.md             # Converted markdown content
│   └── <id>.extraction.md  # LLM extraction results (optional)
└── patterns/               # Custom extraction patterns (optional)
    └── <name>/
        └── system.md
```

---

## Commands

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `add <url>` | Save URL as markdown | `--extract`, `--tags`, `--json` |
| `add <file>` | Convert file to markdown | `--extract`, `--json` |
| `note <text>` | Quick text note | `--json` |
| `list` | List library | `--json` |
| `read <id>` | Read content | `--extract` (extraction only), `--full` (both), `--json` |
| `search <query>` | Full-text search | `--json` |
| `extract <id>` | Run LLM extraction on existing item | `--patterns`, `--json` |
| `patterns` | List available extraction patterns | — |
| `delete <id>` | Remove item | `--json` |
| `status` | Library stats | `--json` |
| `serve` | HTTP server on port 24242 | `--port` |
| `mcp` | MCP server over stdio | — |

---

## Extraction Patterns

6 built-in Fabric-inspired patterns. Each pattern = one focused LLM API call.

| Pattern | What It Extracts |
|---------|-----------------|
| `extract_wisdom` | Ideas, insights, quotes, habits, facts, references, recommendations |
| `video_chapters` | Timestamped chapter outline from transcript |
| `analyze_claims` | Truth claims with evidence ratings (A–F) and logical fallacies |
| `extract_references` | Books, papers, tools, people mentioned |
| `summarize` | One-sentence summary + main points + takeaways |
| `rate_content` | Quality scores: surprise, novelty, insight, value, wisdom (0–10) |

Default patterns on `--extract`: `extract_wisdom` + `video_chapters`.

Custom patterns: create `~/.nomfeed/patterns/<name>/system.md` with your prompt.

---

## Common Agent Workflows

### 1. Save URL with Extraction
```bash
nomfeed add "https://example.com/article" --extract --json
# Returns: { id, title, type, strategy, extracting: true }

# Read extraction results
nomfeed read <id> --extract
```

### 2. YouTube Video with Transcript
```bash
nomfeed add "https://youtube.com/watch?v=..." --extract --json
# Extracts transcript via yt-dlp, runs extract_wisdom + video_chapters
```

### 3. Convert Local File
```bash
nomfeed add ./document.pdf --json
nomfeed add ./spreadsheet.xlsx --json
nomfeed add ./source.py --json
```

### 4. Quick Note
```bash
nomfeed note "Remember to review the API design" --json
```

### 5. Search Library
```bash
nomfeed search "machine learning" --json
```

### 6. Extract from Existing Item
```bash
nomfeed extract <id> --patterns summarize,analyze_claims --json
nomfeed read <id> --extract
```

### 7. Batch Save
```bash
for url in "https://a.com" "https://b.com" "https://c.com"; do
  nomfeed add "$url" --json
done
```

### 8. Use as MCP Server
```bash
# In Claude Desktop / Cursor config:
# "command": "bun", "args": ["run", "/path/to/nomfeed/src/cli.ts", "mcp"]
nomfeed mcp
```
