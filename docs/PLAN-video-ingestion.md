# Video Ingestion Plan — NomFeed

## Problem

We want `nomfeed add <youtube-url>` to produce rich, agent-consumable markdown — not just a summary, but structured knowledge extracted through multiple lenses.

## What We Have

- **yt-dlp** installed locally — can extract metadata + subtitles/transcripts without downloading video
- **Fabric patterns** (danielmiessler) — 251 battle-tested extraction prompts
- **An LLM** (via the user's configured provider) — to run extraction patterns against transcripts

## Design Decisions

### 1. Transcript is the source of truth

yt-dlp extracts subtitles (manual or auto-generated) as VTT. We parse that into clean timestamped text. This is the raw material everything else is built from. No audio processing, no video frames — just the transcript + metadata.

### 2. Multi-lens extraction, not single-summary

Instead of running one "summarize" prompt, we run **multiple extraction patterns** against the same transcript and compose the results into a single rich markdown document. This is the key insight from Fabric — the same content yields different value depending on the extraction lens.

### 3. Extraction patterns are local markdown files (user-customizable)

Ship with a default set of patterns inspired by Fabric. Users can add their own in `~/.nomfeed/patterns/`. Each pattern is just a `system.md` file — a prompt template.

### 4. LLM is pluggable — not baked in

We don't hardcode an LLM provider. The extraction step shells out to a configurable command (e.g., `NOMFEED_LLM_CMD="anthropic"` or `NOMFEED_LLM_CMD="ollama run llama3"`), or uses a simple provider abstraction that supports Anthropic/OpenAI/Ollama.

### 5. Two modes: fast (transcript-only) and deep (LLM-extracted)

- **Fast mode** (`nomfeed add <yt-url>`): Saves raw transcript + metadata as markdown. No LLM needed. Instant.
- **Deep mode** (`nomfeed add <yt-url> --extract`): Runs extraction patterns against transcript. Requires LLM. Takes 30-60s.

This means the tool is always useful even without an LLM key configured.

---

## Architecture

```
nomfeed add <youtube-url> --extract
    │
    ├─ 1. yt-dlp: metadata + transcript (VTT → clean text)
    │
    ├─ 2. Build raw markdown (always saved)
    │      ├── YAML frontmatter (title, channel, date, duration, url)
    │      └── Timestamped transcript
    │
    └─ 3. If --extract: run extraction pipeline
           ├── Pattern: extract_wisdom  → IDEAS, INSIGHTS, QUOTES, HABITS, FACTS, REFERENCES
           ├── Pattern: video_chapters  → Timestamped chapter outline
           ├── Pattern: analyze_claims  → Claim ratings + evidence
           ├── Pattern: extract_references → Books, papers, tools mentioned
           └── Compose all into final markdown document
```

## Output Format

A single `{id}.md` file with all extractions composed as sections:

```markdown
---
source: https://youtube.com/watch?v=xyz
title: "Talk Title"
channel: "Channel Name"
duration: 3600
date: 2026-02-28
type: youtube
strategy: yt-dlp
extracted: true
patterns: [extract_wisdom, video_chapters, analyze_claims]
---

# Talk Title

**Channel:** Channel Name | **Duration:** 1:00:00 | **Date:** 2026-02-28

## Summary

25-word summary here.

## Key Ideas

- Idea 1 in exactly 16 words as specified by the pattern format.
- Idea 2...

## Insights

- Refined insight 1...

## Notable Quotes

- "Exact quote from transcript" — Speaker Name

## Chapters

- 00:00:00 Introduction and Setup
- 00:05:30 The Core Problem
- 00:12:15 Proposed Solution
...

## Claims Analysis

### Claim: "X is Y"
- **Rating:** B (High)
- **Support:** Evidence...
- **Counter:** Counter-evidence...

## References

- Book/paper/tool mentioned
- ...

## Recommendations

- Actionable recommendation 1...
- ...

## One-Sentence Takeaway

The most important essence of this content in 15 words.

---

## Raw Transcript

<details>
<summary>Full timestamped transcript (click to expand)</summary>

[00:00:00] First line of transcript...
[00:00:05] Second line...
...

</details>
```

## Implementation Plan

### Phase 1: yt-dlp Integration (no LLM needed)

**File: `src/youtube.ts`**

1. Detect YouTube URLs in the converter (`isYouTubeUrl()`)
2. Run `yt-dlp --dump-json --no-download <url>` → parse metadata
3. Run `yt-dlp --write-auto-subs --sub-format vtt --sub-langs en --skip-download` → get VTT
4. Parse VTT → clean timestamped text (deduplicate overlapping lines, strip formatting tags)
5. Compose markdown: frontmatter + metadata header + raw transcript
6. Wire into existing `urlToMarkdown()` pipeline

**This alone is useful.** Agents get the full transcript as searchable markdown.

### Phase 2: Extraction Patterns

**File: `src/patterns.ts`**

1. Ship default patterns as embedded strings (no external file dependency):
   - `extract_wisdom` — Ideas, insights, quotes, habits, facts, references, recommendations
   - `video_chapters` — Timestamped chapter outline
   - `summarize` — One-sentence summary + main points + takeaways
2. Load user patterns from `~/.nomfeed/patterns/` (optional override/additions)
3. Each pattern is: `{ name: string; system: string; outputSection: string }`

### Phase 3: LLM Abstraction

**File: `src/llm.ts`**

Simple provider interface — we just need `complete(system: string, user: string): Promise<string>`:

```typescript
interface LLMProvider {
  complete(system: string, user: string): Promise<string>;
}
```

Supported backends (checked in order):
1. `NOMFEED_LLM_CMD` env var → shell out (e.g., `echo "$input" | fabric -p extract_wisdom`)
2. `ANTHROPIC_API_KEY` → direct Anthropic API call
3. `OPENAI_API_KEY` → direct OpenAI API call
4. `NOMFEED_OLLAMA_MODEL` → local Ollama

### Phase 4: Extraction Pipeline

**File: `src/extract.ts`**

1. Accept transcript text + list of pattern names
2. Run each pattern against transcript (parallel where possible)
3. Compose results into structured markdown sections
4. Return final composed markdown

### Phase 5: Wire into CLI

- `nomfeed add <yt-url>` → fast mode (transcript only)
- `nomfeed add <yt-url> --extract` → deep mode (run patterns)
- `nomfeed add <yt-url> --extract --patterns wisdom,chapters` → specific patterns only
- `nomfeed add <yt-url> --extract --pattern-dir ./my-patterns` → custom patterns
- `nomfeed extract <id>` → run extraction on already-saved transcript (re-process)
- `nomfeed patterns` → list available patterns

### Phase 6: MCP + Extension

- `nomfeed_add` tool gains `extract` option
- `nomfeed_extract` new tool to re-extract from existing items
- `nomfeed_patterns` new tool to list available patterns
- Extension gets "Extract Wisdom" button for YouTube tabs

---

## Default Patterns (what we ship)

| Pattern | Sections Produced | Best For |
|---|---|---|
| `extract_wisdom` | Summary, Ideas, Insights, Quotes, Habits, Facts, References, Recommendations, One-Sentence Takeaway | Talks, podcasts, interviews |
| `video_chapters` | Timestamped chapter outline | Navigation, content structure |
| `summarize` | One-Sentence Summary, Main Points, Takeaways | Quick overview |
| `analyze_claims` | Claims with ratings, evidence, counter-evidence | Debates, opinion pieces |
| `extract_references` | Books, papers, tools, projects mentioned | Research, learning |
| `rate_content` | WPM (wow-per-minute) score + explanation | Content quality triage |

## What We Explicitly Don't Do

- **No audio transcription** — yt-dlp gets subtitles; if there are none, we fail gracefully
- **No video frame analysis** — transcript-only
- **No Fabric dependency** — we ship our own patterns inspired by Fabric's approach
- **No complex orchestration** — patterns run as simple prompt → response, composed after
- **No streaming** — extraction runs to completion, then saves

## Implementation Order

1. **Phase 1** — yt-dlp transcript extraction (`src/youtube.ts`) — immediate value, no LLM
2. **Phase 2** — Patterns system (`src/patterns.ts`) — just data, no execution yet
3. **Phase 3** — LLM abstraction (`src/llm.ts`) — thin, provider-agnostic
4. **Phase 4** — Extraction pipeline (`src/extract.ts`) — ties it all together
5. **Phase 5** — CLI integration — `--extract` flag, `extract` command, `patterns` command
6. **Phase 6** — MCP + Extension updates — expose new capabilities
