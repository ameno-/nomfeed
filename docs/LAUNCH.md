# NomFeed — Launch & GTM

## Brand

**Name:** NomFeed
**Tagline:** Nom the web. Feed your agents.
**One-liner:** Convert any URL, video, or file into structured markdown for AI agents.
**Emoji:** 🍴
**Tone:** Playful but competent. Developer-friendly. Not corporate.

## Description (varying lengths)

**10 words:**
Save anything as agent-ready markdown. CLI, MCP, Chrome extension.

**25 words:**
NomFeed converts URLs, YouTube videos, PDFs, and files into clean structured markdown. CLI + MCP server + Chrome extension. No database, just .md files.

**50 words:**
NomFeed is an open-source tool that converts any URL, YouTube video, file, or note into structured markdown optimized for AI coding agents. It uses Cloudflare's text/markdown, Jina Reader for JS-heavy sites, yt-dlp for video transcripts, and Fabric-inspired LLM extraction patterns to turn raw content into searchable knowledge. CLI, MCP server, and Chrome extension included.

**100 words:**
Your AI agents are starving for context. You have 200 tabs open, a stack of PDFs, and hours of YouTube talks you'll "watch later." NomFeed fixes this. One command or one click converts any URL, YouTube video, file, or note into clean, structured markdown — stored locally as .md files that any AI agent can search and read.

For YouTube videos, NomFeed extracts full timestamped transcripts via yt-dlp, then optionally runs Fabric-inspired LLM extraction patterns to pull out ideas, insights, quotes, claims, and references — not just a summary, but structured knowledge.

CLI-first. MCP server for agents. Chrome extension for humans. No database, no Docker, no cloud.

---

## GTM Strategy

### Target Audience (in priority order)

1. **AI coding agent users** — People using Claude Code, Pi, Cursor, Windsurf, Copilot. They need context for their agents but have no pipeline.
2. **Developer knowledge hoarders** — People who bookmark 50 things a day and never read them. They want their bookmarks actually useful.
3. **YouTube/podcast learners** — People who watch hours of technical content and want to retain the knowledge.
4. **MCP ecosystem builders** — People exploring MCP servers and looking for useful tools to connect to their agents.

### Distribution Channels

| Channel | Content | Timing |
|---|---|---|
| **GitHub** | Clean README, good first impression | Day 0 |
| **Hacker News** | Show HN post | Day 1 |
| **Reddit** | r/LocalLLaMA, r/ClaudeAI, r/ChatGPTPro, r/commandline, r/selfhosted | Day 1-2 |
| **Twitter/X** | Thread showing the workflow | Day 1 |
| **Product Hunt** | Full launch with screenshots | Week 2 |
| **MCP directories** | Smithery, Glama, mcp.so | Week 1 |
| **Dev.to / Medium** | "I replaced my bookmark manager with 1800 lines of TypeScript" | Week 2-3 |

### Key Differentiators to Emphasize

1. **"Not another bookmark manager"** — NomFeed converts content, it doesn't just save links.
2. **"Extraction, not summary"** — Fabric-style multi-dimensional extraction (ideas + quotes + claims + references), not a GPT summary.
3. **"Agent-native"** — MCP server built in. Your AI coding agent can search your library.
4. **"1800 lines, no dependencies"** — No database, no Docker, no cloud. Just TypeScript and .md files.
5. **"YouTube pipeline"** — yt-dlp → transcript → LLM extraction is the hero demo.

---

## Launch Posts

### Hacker News — Show HN

**Title:** Show HN: NomFeed – Nom the web, feed your AI agents (URL/YouTube/files → structured markdown)

**Body:**

Hey HN,

I built NomFeed because my AI coding agents (Claude Code, Pi) kept asking me for context I had scattered across 200 browser tabs, PDFs, and YouTube videos I watched months ago.

NomFeed converts everything into markdown:

- **URLs** → Cloudflare text/markdown, Jina Reader fallback (handles JS-heavy sites)
- **YouTube** → Full timestamped transcript via yt-dlp
- **Files** → PDF, DOCX, XLSX via Microsoft's markitdown
- **Notes** → Quick text capture

The interesting part is the extraction pipeline. Instead of just saving content, you can run Fabric-inspired LLM patterns against it:

```
nomfeed add https://youtube.com/watch?v=xyz --extract
```

This produces structured sections: IDEAS, INSIGHTS, QUOTES, FACTS, REFERENCES, RECOMMENDATIONS — not just a summary.

Everything is stored as flat .md files in ~/.nomfeed. No database, no Docker, no cloud account. ~1800 lines of TypeScript.

Comes with a CLI, MCP server (so agents can search your library), and Chrome extension.

GitHub: https://github.com/ameno-/nomfeed

---

### Reddit — r/ClaudeAI

**Title:** I built a tool that converts URLs, YouTube videos, and files into markdown for Claude Code / AI agents

**Body:**

I kept running into the same problem: I'd watch a YouTube talk, read an article, or download a PDF — and then weeks later my AI agent would need that context and I had no way to give it to them.

So I built **NomFeed** — a CLI tool + MCP server + Chrome extension that converts everything into markdown.

**The workflow:**
1. Browse the web, see something interesting
2. Click the Chrome extension (or `nomfeed add <url>` from terminal)
3. Content gets converted to clean markdown and stored locally
4. Your AI agent searches your library via MCP: "What do I have about transformers?"

**The YouTube pipeline is the killer feature.** `nomfeed add <youtube-url> --extract` grabs the transcript via yt-dlp, then runs Fabric-style extraction patterns via Claude to pull out ideas, insights, quotes, facts, and references. Not a summary — structured knowledge.

Everything is local .md files. No cloud, no account, no subscription. ~1800 lines of TypeScript.

https://github.com/ameno-/nomfeed

---

### Reddit — r/LocalLLaMA

**Title:** NomFeed: Save URLs/YouTube/files as markdown, extract with LLM patterns (works with any OpenRouter model)

**Body:**

Open source tool that converts any content into structured markdown:

- URLs → markdown (Cloudflare text/markdown + Jina Reader for JS sites)
- YouTube → timestamped transcript via yt-dlp
- Files → PDF, DOCX via markitdown
- Optional: Run extraction patterns via any LLM on OpenRouter

The extraction part is inspired by Fabric patterns. Instead of "summarize this", it runs structured prompts that extract IDEAS, INSIGHTS, QUOTES, CLAIMS, REFERENCES, etc. Works with any model — defaults to Claude Sonnet 4.5 but you can use whatever: `--model meta-llama/llama-4-scout`

No database. Just .md files in ~/.nomfeed. CLI + MCP server + Chrome extension.

https://github.com/ameno-/nomfeed

---

### Reddit — r/selfhosted

**Title:** NomFeed — self-hosted bookmark manager that actually converts content to markdown (no Docker needed)

**Body:**

Tired of bookmark managers that save links you never revisit. Built NomFeed — it doesn't just save the URL, it fetches and converts the content to markdown.

- URLs get converted via Cloudflare's text/markdown or Jina Reader
- YouTube videos get full transcripts via yt-dlp
- PDFs, Word docs, Excel files get converted via markitdown
- Everything stored as flat .md files in ~/.nomfeed

No Docker, no database, no accounts. Just `bun install && bun link` and you're running.

Has a local HTTP server + Chrome extension so you can save with one click.

https://github.com/ameno-/nomfeed

---

### Twitter/X Thread

**Tweet 1:**
🍴 Introducing NomFeed — nom the web, feed your agents.

Convert any URL, YouTube video, or file into structured markdown. CLI + MCP server + Chrome extension.

Your AI agents are starving for context. Feed them.

github.com/ameno-/nomfeed

**Tweet 2:**
The YouTube pipeline is wild:

```
nomfeed add https://youtube.com/watch?v=xyz --extract
```

1. yt-dlp grabs the transcript
2. LLM runs Fabric-style extraction
3. You get: IDEAS, INSIGHTS, QUOTES, FACTS, REFERENCES

Not a summary. Structured knowledge.

**Tweet 3:**
URLs use a 3-strategy cascade:

1. Cloudflare `Accept: text/markdown` (native, fastest)
2. Jina Reader (renders JS, handles SPAs)
3. Readability + Turndown (classic fallback)

JS-heavy sites that return nothing with curl? NomFeed handles them.

**Tweet 4:**
The whole thing is ~1800 lines of TypeScript.

No database. No Docker. No cloud.
Just .md files in ~/.nomfeed.

CLI for agents. Chrome extension for humans. MCP server for both.

**Tweet 5:**
Setup:

```
git clone github.com/ameno-/nomfeed
cd nomfeed && bun install && bun link
nomfeed add https://any-url.com
```

That's it. You're running.

Optional: set OPENROUTER_API_KEY for LLM extraction.

---

### Product Hunt

**Tagline:** Nom the web. Feed your agents.

**Description:**

NomFeed converts any URL, YouTube video, file, or note into clean, structured markdown — optimized for AI coding agents.

🔗 **URLs** — Cloudflare text/markdown with Jina Reader fallback (handles JS-heavy sites)
🎬 **YouTube** — Full timestamped transcript + Fabric-style LLM extraction
📄 **Files** — PDF, DOCX, XLSX, images via Microsoft's markitdown
📝 **Notes** — Quick text capture

**What makes it different:**
- Not just a bookmark manager — it converts and extracts
- Fabric-inspired extraction patterns: IDEAS, INSIGHTS, QUOTES, CLAIMS, REFERENCES
- MCP server built in — your AI agents can search your entire library
- ~1800 lines of TypeScript, no database, no Docker, just .md files

**Maker's comment:**

I built NomFeed because I was drowning in tabs, PDFs, and YouTube videos I'd "watch later." My AI coding agents kept needing context I couldn't give them. NomFeed is the pipeline between "I saw something interesting" and "my agent can use this."

The extraction pipeline is the part I'm most excited about. Instead of saving a link and forgetting it, NomFeed can run LLM patterns that extract structured knowledge — not a summary, but ideas, insights, verbatim quotes, factual claims with evidence ratings, references to books and tools. It's like having a research assistant that reads everything for you.

Everything is local. No cloud, no accounts, no subscription. Just markdown files on your disk.
