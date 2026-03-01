#!/usr/bin/env bun
/**
 * MarkStash CLI — dead-simple bookmark/file → markdown manager.
 *
 * Usage:
 *   markstash add <url-or-file>       Save URL or file as markdown
 *   markstash add <yt-url> --extract  Save + run extraction patterns via LLM
 *   markstash note <text>             Save a quick note
 *   markstash list [--query q]        List saved items
 *   markstash read <id>               Output markdown content
 *   markstash search <query>          Full-text search
 *   markstash extract <id>            Run extraction patterns on existing item
 *   markstash patterns                List available extraction patterns
 *   markstash delete <id>             Remove item
 *   markstash serve [--port N]        Start HTTP server (for extension)
 *   markstash mcp                     Start MCP server (stdio)
 *   markstash status                  Show stats
 */

import { addItem, listItems, readContent, searchContent, deleteItem, getItem, itemCount, getDataDir } from "./store";
import { urlToMarkdown, fileToMarkdown, noteToMarkdown } from "./convert";
import { extract } from "./extract";
import { listPatterns, DEFAULT_EXTRACT_PATTERNS } from "./patterns";
import { isConfigured, getConfig } from "./llm";
import { startServer } from "./server";
import { startMcp } from "./mcp";

const args = process.argv.slice(2);
const command = args[0];

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

/** Strip --flag and --flag value pairs, leaving only positional args */
function stripFlags(a: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) {
      // Boolean flags (no value): --json, --extract
      if (["--json", "--extract"].includes(a[i])) {
        continue;
      }
      i++; // skip the flag value too
    } else {
      result.push(a[i]);
    }
  }
  return result;
}

const json = hasFlag("json");

function out(data: any) {
  if (json) {
    console.log(JSON.stringify({ ok: true, data }, null, 2));
  } else {
    if (typeof data === "string") {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

function err(msg: string, code = 1) {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`error: ${msg}`);
  }
  process.exit(code);
}

function progress(msg: string) {
  if (!json) process.stderr.write(`  ${msg}\n`);
}

async function main() {
  switch (command) {
    // ── add ──────────────────────────────────────────────────────────────
    case "add": {
      const target = args[1];
      if (!target) err("Usage: markstash add <url-or-file> [--extract] [--patterns p1,p2]");

      const title = flag("title");
      const tags = flag("tags")?.split(",").map(t => t.trim()) || [];
      const doExtract = hasFlag("extract");
      const patternNames = flag("patterns")?.split(",").map(p => p.trim());
      const model = flag("model");

      try {
        let result: { title: string; markdown: string; strategy?: string };
        let type: "url" | "file";

        if (target.startsWith("http://") || target.startsWith("https://")) {
          type = "url";
          progress(`Fetching ${target}...`);
          result = await urlToMarkdown(target);
          progress(`Fetched via ${result.strategy}`);
        } else {
          type = "file";
          progress(`Converting ${target}...`);
          result = await fileToMarkdown(target);
        }

        // Run extraction if requested
        if (doExtract) {
          const patterns = patternNames || DEFAULT_EXTRACT_PATTERNS;
          progress(`Extracting with patterns: ${patterns.join(", ")}...`);

          // Use the raw content (strip frontmatter if present) for extraction
          const extractContent = result.markdown;

          const extraction = await extract(extractContent, patterns, {
            model,
            onProgress: (name, status) => {
              if (status === "start") progress(`  Running ${name}...`);
              else if (status === "done") progress(`  ✓ ${name} done`);
              else progress(`  ✗ ${name} failed`);
            },
          });

          // Compose: original content + extraction results
          result.markdown = result.markdown + "\n\n---\n\n# Extraction\n\n" + extraction.composed;
          progress(`Extraction complete (${extraction.totalTokens} tokens)`);
        }

        const item = addItem({
          type,
          source: target,
          title: title || result.title,
          markdown: result.markdown,
          tags,
          strategy: result.strategy,
        });

        out(item);
      } catch (e: any) {
        err(e.message);
      }
      break;
    }

    // ── extract ──────────────────────────────────────────────────────────
    case "extract": {
      const id = args[1];
      if (!id) err("Usage: markstash extract <id> [--patterns p1,p2] [--model m]");

      const content = readContent(id);
      if (!content) err(`Not found: ${id}`, 1);

      const patternNames = flag("patterns")?.split(",").map(p => p.trim());
      const model = flag("model");
      const patterns = patternNames || DEFAULT_EXTRACT_PATTERNS;

      try {
        progress(`Extracting with patterns: ${patterns.join(", ")}...`);

        const extraction = await extract(content!, patterns, {
          model,
          onProgress: (name, status) => {
            if (status === "start") progress(`  Running ${name}...`);
            else if (status === "done") progress(`  ✓ ${name} done`);
            else progress(`  ✗ ${name} failed`);
          },
        });

        progress(`Extraction complete (${extraction.totalTokens} tokens)`);

        if (json) {
          out({
            id,
            patterns: extraction.results.map(r => ({
              pattern: r.pattern,
              model: r.model,
              tokens: r.usage?.total_tokens,
              error: r.error,
            })),
            totalTokens: extraction.totalTokens,
            content: extraction.composed,
          });
        } else {
          console.log(extraction.composed);
        }
      } catch (e: any) {
        err(e.message);
      }
      break;
    }

    // ── patterns ─────────────────────────────────────────────────────────
    case "patterns": {
      const patterns = listPatterns();
      const defaults = new Set(DEFAULT_EXTRACT_PATTERNS);

      if (!json) {
        console.log("Available extraction patterns:\n");
        for (const p of patterns) {
          const def = defaults.has(p.name) ? " (default)" : "";
          console.log(`  ${p.name.padEnd(20)} ${p.description}${def}`);
        }
        console.log(`\n${patterns.length} pattern(s). Defaults: ${DEFAULT_EXTRACT_PATTERNS.join(", ")}`);
        console.log(`\nCustom patterns: ~/.markstash/patterns/<name>/system.md`);
      } else {
        out(patterns.map(p => ({
          name: p.name,
          description: p.description,
          default: defaults.has(p.name),
        })));
      }
      break;
    }

    // ── note ─────────────────────────────────────────────────────────────
    case "note": {
      const text = stripFlags(args.slice(1)).join(" ");
      if (!text) err("Usage: markstash note <text>");

      const title = flag("title");
      const tags = flag("tags")?.split(",").map(t => t.trim()) || [];
      const { title: t, markdown } = noteToMarkdown(text, title);

      const item = addItem({
        type: "note",
        source: "note",
        title: t,
        markdown,
        tags,
      });

      out(item);
      break;
    }

    // ── list ─────────────────────────────────────────────────────────────
    case "list":
    case "ls": {
      const items = listItems({
        query: flag("query") || flag("q"),
        tag: flag("tag"),
        type: flag("type"),
        limit: flag("limit") ? parseInt(flag("limit")!) : undefined,
      });

      if (!json) {
        if (items.length === 0) {
          console.log("No items saved yet. Try: markstash add <url>");
          break;
        }
        for (const item of items) {
          const date = new Date(item.savedAt).toLocaleDateString();
          const tags = item.tags.length ? ` [${item.tags.join(", ")}]` : "";
          const strat = item.strategy ? ` (${item.strategy})` : "";
          console.log(`  ${item.id}  ${item.type.padEnd(4)}  ${date}  ${item.title}${tags}${strat}`);
        }
        console.log(`\n${items.length} item(s)`);
      } else {
        out(items);
      }
      break;
    }

    // ── read ─────────────────────────────────────────────────────────────
    case "read":
    case "cat": {
      const id = args[1];
      if (!id) err("Usage: markstash read <id>");

      const content = readContent(id);
      if (!content) err(`Not found: ${id}`, 1);

      if (json) {
        const item = getItem(id);
        out({ ...item, content });
      } else {
        console.log(content);
      }
      break;
    }

    // ── search ───────────────────────────────────────────────────────────
    case "search":
    case "s": {
      const query = stripFlags(args.slice(1)).join(" ");
      if (!query) err("Usage: markstash search <query>");

      const limit = flag("limit") ? parseInt(flag("limit")!) : 20;
      const results = searchContent(query, limit);

      if (!json) {
        if (results.length === 0) {
          console.log("No results.");
          break;
        }
        for (const r of results) {
          console.log(`  ${r.id}  ${r.title}`);
          console.log(`         ${r.snippet}`);
          console.log();
        }
        console.log(`${results.length} result(s)`);
      } else {
        out(results);
      }
      break;
    }

    // ── delete ───────────────────────────────────────────────────────────
    case "delete":
    case "rm": {
      const id = args[1];
      if (!id) err("Usage: markstash delete <id>");

      if (deleteItem(id)) {
        out({ deleted: id });
      } else {
        err(`Not found: ${id}`, 1);
      }
      break;
    }

    // ── serve ────────────────────────────────────────────────────────────
    case "serve": {
      const port = flag("port") ? parseInt(flag("port")!) : 24242;
      await startServer(port);
      break;
    }

    // ── mcp ──────────────────────────────────────────────────────────────
    case "mcp": {
      await startMcp();
      break;
    }

    // ── status ───────────────────────────────────────────────────────────
    case "status": {
      const count = itemCount();
      const dir = getDataDir();
      const llmConfig = getConfig();
      out({
        items: count,
        dataDir: dir,
        llm: llmConfig,
      });
      break;
    }

    // ── help ─────────────────────────────────────────────────────────────
    case "help":
    case "--help":
    case "-h":
    case undefined: {
      console.log(`
markstash — save anything as markdown

Commands:
  add <url-or-file>     Save URL or file as markdown
  note <text>           Save a quick note
  list                  List saved items
  read <id>             Output markdown content
  search <query>        Full-text search
  extract <id>          Run extraction patterns on existing item
  patterns              List available extraction patterns
  delete <id>           Remove item
  serve [--port N]      Start HTTP server (default: 24242)
  mcp                   Start MCP server (stdio)
  status                Show stats

Add Flags:
  --extract             Run LLM extraction patterns after saving
  --patterns <a,b>      Specific patterns to run (default: extract_wisdom,video_chapters)
  --model <m>           Override LLM model (OpenRouter model ID)
  --title <t>           Override title
  --tags <a,b>          Comma-separated tags

General Flags:
  --json                Machine-readable JSON output
  --query <q>           Filter by title/source (list)
  --tag <t>             Filter by tag (list)
  --limit <n>           Limit results

Environment:
  OPENROUTER_API_KEY    Required for --extract (get at openrouter.ai/keys)
  MARKSTASH_MODEL       Override default model (default: anthropic/claude-sonnet-4.5)
  MARKSTASH_DIR         Override data directory (default: ~/.markstash)

Examples:
  markstash add https://example.com/article
  markstash add https://youtube.com/watch?v=xyz --extract
  markstash add https://youtube.com/watch?v=xyz --extract --patterns wisdom,chapters,claims
  markstash add ./report.pdf --tags work,q4
  markstash extract abc123 --patterns summarize,rate_content
  markstash patterns
  markstash search "machine learning" --json
`);
      break;
    }

    default:
      err(`Unknown command: ${command}. Try: markstash help`);
  }
}

main().catch(e => err(e.message));
