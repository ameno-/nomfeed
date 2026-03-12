#!/usr/bin/env bun
/**
 * NomFeed CLI — dead-simple bookmark/file → markdown manager.
 *
 * Usage:
 *   nomfeed add <url-or-file>       Save URL or file as markdown
 *   nomfeed add <yt-url> --extract  Save + run extraction patterns via LLM
 *   nomfeed note <text>             Save a quick note
 *   nomfeed list [--query q]        List saved items
 *   nomfeed read <id>               Output markdown content
 *   nomfeed search <query>          Full-text search
 *   nomfeed extract <id>            Run extraction patterns on existing item
 *   nomfeed patterns                List available extraction patterns
 *   nomfeed delete <id>             Remove item
 *   nomfeed serve [--port N]        Start HTTP server (for extension)
 *   nomfeed mcp                     Start MCP server (stdio)
 *   nomfeed status                  Show stats
 */

import {
  addItem,
  deleteItem,
  findItemBySource,
  getDataDir,
  getItem,
  itemCount,
  listCaptures,
  listItems,
  readBundle,
  readContent,
  readExtraction,
  saveExtraction,
  searchContent,
  totalCaptureCount,
} from "./store";
import { urlToMarkdown, fileToMarkdown, noteToMarkdown } from "./convert";
import { extract } from "./extract";
import { listPatterns, DEFAULT_EXTRACT_PATTERNS } from "./patterns";
import { isConfigured, getConfig } from "./llm";
import { startServer } from "./server";
import { startMcp } from "./mcp";
import { importBookmarks, type ImportSource } from "./import";

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
      // Boolean flags (no value)
      if (["--json", "--extract", "--full", "--bundle", "--captures", "--has-captures", "--no-open"].includes(a[i])) {
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

async function openInBrowser(target: string): Promise<boolean> {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "linux"
      ? "xdg-open"
      : null;

  if (!command) return false;

  try {
    const proc = Bun.spawn([command, target], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

async function main() {
  switch (command) {
    // ── add ──────────────────────────────────────────────────────────────
    case "add": {
      const target = args[1];
      if (!target) err("Usage: nomfeed add <url-or-file> [--extract] [--patterns p1,p2]");

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

        const item = addItem({
          type,
          source: target,
          title: title || result.title,
          markdown: result.markdown,
          tags,
          strategy: result.strategy,
        });

        // Run extraction if requested (saved separately)
        if (doExtract) {
          const patterns = patternNames || DEFAULT_EXTRACT_PATTERNS;
          progress(`Extracting with patterns: ${patterns.join(", ")}...`);

          const extraction = await extract(result.markdown, patterns, {
            model,
            onProgress: (name, status) => {
              if (status === "start") progress(`  Running ${name}...`);
              else if (status === "done") progress(`  ✓ ${name} done`);
              else progress(`  ✗ ${name} failed`);
            },
          });

          saveExtraction(item.id, extraction.composed, patterns);
          progress(`Extraction complete (${extraction.totalTokens} tokens)`);
          item.extracted = true;
          item.extractionPatterns = patterns;
        }

        out(item);
      } catch (e: any) {
        err(e.message);
      }
      break;
    }

    // ── import ───────────────────────────────────────────────────────────
    case "import": {
      const filePath = args[1];
      if (!filePath) err("Usage: nomfeed import <file> [--source twitter|browser|json] [--fetch] [--extract] [--tags a,b]");

      const source = (flag("source") || "json") as ImportSource;
      const doFetch = hasFlag("fetch");
      const doExtract = hasFlag("extract");
      const importTags = flag("tags")?.split(",").map(t => t.trim()) || [];
      const model = flag("model");

      progress(`Importing from ${filePath} (${source})...`);

      const result = importBookmarks(filePath, source);

      if (result.errors.length > 0) {
        for (const error of result.errors) {
          progress(`Warning: ${error}`);
        }
      }

      if (result.items.length === 0) {
        err("No items found to import.");
      }

      progress(`Found ${result.items.length} item(s) to import`);

      const imported: typeof result.items = [];
      const failed: { item: typeof result.items[0]; error: string }[] = [];

      for (const item of result.items) {
        try {
          // Merge tags
          const tags = [...new Set([...(item.tags || []), ...importTags])];

          if (doFetch) {
            // Fetch content and save as markdown
            progress(`Fetching ${item.url}...`);
            const result = await urlToMarkdown(item.url);

            const savedItem = addItem({
              type: "url",
              source: item.url,
              title: item.title || result.title,
              markdown: result.markdown,
              tags,
              strategy: result.strategy,
            });

            // Run extraction if requested
            if (doExtract && isConfigured()) {
              const patterns = DEFAULT_EXTRACT_PATTERNS;
              progress(`Extracting ${savedItem.id}...`);

              try {
                const extraction = await extract(result.markdown, patterns, { model });
                saveExtraction(savedItem.id, extraction.composed, patterns);
                savedItem.extracted = true;
                savedItem.extractionPatterns = patterns;
              } catch (e: any) {
                progress(`Extraction failed for ${savedItem.id}: ${e.message}`);
              }
            }

            imported.push({ ...item, title: savedItem.title });
          } else {
            // Just store the URL as a note item (no fetch)
            const savedItem = addItem({
              type: "note",
              source: item.url,
              title: item.title || "Bookmark",
              markdown: `# ${item.title || "Bookmark"}\n\n**URL:** ${item.url}\n\n${item.description || ""}`,
              tags: [...tags, "bookmark", item.sourceType],
            });

            imported.push({ ...item, title: savedItem.title });
          }
        } catch (e: any) {
          failed.push({ item, error: e.message });
          progress(`Failed: ${item.url} - ${e.message}`);
        }
      }

      if (json) {
        out({
          imported: imported.length,
          failed: failed.length,
          total: result.items.length,
          items: imported,
          errors: failed.map(f => ({ url: f.item.url, error: f.error })),
        });
      } else {
        console.log(`\nImport complete:`);
        console.log(`  Imported: ${imported.length}`);
        console.log(`  Failed: ${failed.length}`);
        console.log(`  Total: ${result.items.length}`);
        if (doFetch) {
          console.log(`\nContent fetched and saved. Use 'nomfeed list' to view.`);
        } else {
          console.log(`\nURLs saved as notes. Use --fetch to convert to markdown.`);
        }
      }
      break;
    }

    // ── annotate ─────────────────────────────────────────────────────────
    case "annotate": {
      const target = args[1];
      if (!target) err("Usage: nomfeed annotate <url-or-id> [--no-open]");

      try {
        let item;
        let url: string;

        if (target.startsWith("http://") || target.startsWith("https://")) {
          url = target;
          item = findItemBySource({ type: "url", source: target });

          if (!item) {
            progress(`Fetching ${target}...`);
            const result = await urlToMarkdown(target);
            progress(`Fetched via ${result.strategy}`);
            item = addItem({
              type: "url",
              source: target,
              title: result.title,
              markdown: result.markdown,
              strategy: result.strategy,
            });
          }
        } else {
          item = getItem(target);
          if (!item) err(`Not found: ${target}`, 1);
          if (!item) return; // type guard
          if (item.type !== "url") err("Annotate currently only supports saved URL items.", 1);
          if (item.type !== "url") return; // type guard
          url = item.source;
        }

        const opened = hasFlag("no-open") ? false : await openInBrowser(url);
        const data = {
          item,
          url,
          opened,
          nextStep: "Use the floating NomFeed launcher on the page and choose Annotate Page.",
        };

        if (json) {
          out(data);
        } else {
          console.log(`Annotation target ready: ${item.id}`);
          console.log(`URL: ${url}`);
          console.log(opened ? "Opened in browser." : "Browser not opened automatically.");
          console.log("Next: use the floating NomFeed launcher on the page and choose Annotate Page.");
        }
      } catch (e: any) {
        err(e.message);
      }

      break;
    }

    // ── extract ──────────────────────────────────────────────────────────
    case "extract": {
      const id = args[1];
      if (!id) err("Usage: nomfeed extract <id> [--patterns p1,p2] [--model m]");

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

        // Save extraction to disk
        saveExtraction(id, extraction.composed, patterns);
        progress(`Extraction saved (${extraction.totalTokens} tokens)`);
        progress(`Read with: nomfeed read ${id} --extract`);

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
        console.log(`\nCustom patterns: ~/.nomfeed/patterns/<name>/system.md`);
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
      if (!text) err("Usage: nomfeed note <text>");

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
          hasCaptures: hasFlag("has-captures"),
        });

      if (!json) {
        if (items.length === 0) {
          console.log("No items saved yet. Try: nomfeed add <url>");
          break;
        }
        for (const item of items) {
          const date = new Date(item.savedAt).toLocaleDateString();
          const tags = item.tags.length ? ` [${item.tags.join(", ")}]` : "";
          const strat = item.strategy ? ` (${item.strategy})` : "";
          const ext = item.extracted ? " ✦" : "";
          const cap = item.captureCount ? ` ⌘${item.captureCount}` : "";
          console.log(`  ${item.id}  ${item.type.padEnd(4)}  ${date}  ${item.title}${tags}${strat}${ext}${cap}`);
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
      if (!id) err("Usage: nomfeed read <id> [--extract] [--full] [--captures] [--bundle]");

      const item = getItem(id);
      if (!item) err(`Not found: ${id}`, 1);

      const wantExtract = hasFlag("extract");
      const wantFull = hasFlag("full");
      const wantCaptures = hasFlag("captures");
      const wantBundle = hasFlag("bundle");

      const content = readContent(id);
      if (!content && !wantCaptures && !wantBundle) err(`Content file missing for: ${id}`, 1);

      const extraction = readExtraction(id);
      const captures = listCaptures(id);
      const bundle = wantBundle ? readBundle(id) : null;

      if (json) {
        const data: any = wantBundle ? bundle : { ...item, content, captures };
        if (extraction) data.extraction = extraction;
        out(data);
      } else if (wantBundle) {
        console.log(JSON.stringify(bundle, null, 2));
      } else if (wantCaptures) {
        console.log(JSON.stringify(captures, null, 2));
      } else if (wantExtract) {
        if (!extraction) err(`No extraction for ${id}. Run: nomfeed extract ${id}`);
        console.log(extraction);
      } else if (wantFull) {
        console.log(content);
        if (extraction) {
          console.log("\n---\n\n# Extraction\n");
          console.log(extraction);
        }
      } else {
        console.log(content);
        if (extraction) {
          progress(`\nExtraction available. Use --extract or --full to include.`);
        }
      }
      break;
    }

    // ── search ───────────────────────────────────────────────────────────
    case "search":
    case "s": {
      const query = stripFlags(args.slice(1)).join(" ");
      if (!query) err("Usage: nomfeed search <query>");

      const limit = flag("limit") ? parseInt(flag("limit")!) : 20;
      const results = searchContent(query, limit);

      if (!json) {
        if (results.length === 0) {
          console.log("No results.");
          break;
        }
        for (const r of results) {
          const kind = r.matchType ? ` (${r.matchType})` : "";
          console.log(`  ${r.id}  ${r.title}${kind}`);
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
      if (!id) err("Usage: nomfeed delete <id>");

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
      const captures = totalCaptureCount();
      const dir = getDataDir();
      const llmConfig = getConfig();
      out({
        items: count,
        captures,
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
nomfeed — save anything as markdown

Commands:
  add <url-or-file>     Save URL or file as markdown
  annotate <url-or-id>  Open a page for annotation
  import <file>         Import bookmarks (Twitter, browser, JSON)
  note <text>           Save a quick note
  list                  List saved items (--has-captures)
  read <id>             Output markdown content (--extract | --full | --captures | --bundle)
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
  --no-open             Do not open annotate target in browser

Import Flags:
  --source <type>       Source type: twitter, browser, json (auto-detected)
  --fetch               Fetch URL content and convert to markdown
  --extract             Run LLM extraction on imported items (requires --fetch)

General Flags:
  --json                Machine-readable JSON output
  --query <q>           Filter by title/source (list)
  --tag <t>             Filter by tag (list)
  --limit <n>           Limit results
  --has-captures        Only items with captures

Environment:
  OPENROUTER_API_KEY    Required for --extract (get at openrouter.ai/keys)
  NOMFEED_MODEL       Override default model (default: anthropic/claude-sonnet-4.5)
  NOMFEED_DIR         Override data directory (default: ~/.nomfeed)

Examples:
  nomfeed add https://example.com/article
  nomfeed add https://youtube.com/watch?v=xyz --extract
  nomfeed annotate https://example.com/login
  nomfeed import bookmarks.json --source twitter --fetch --extract
  nomfeed import tweets.json --fetch --tags twitter,2024
  nomfeed add https://youtube.com/watch?v=xyz --extract --patterns wisdom,chapters,claims
  nomfeed add ./report.pdf --tags work,q4
  nomfeed read abc123 --extract            # just the extraction
  nomfeed read abc123 --full               # content + extraction
  nomfeed extract abc123 --patterns summarize,rate_content
  nomfeed patterns
  nomfeed search "machine learning" --json
`);
      break;
    }

    default:
      err(`Unknown command: ${command}. Try: nomfeed help`);
  }
}

main().catch(e => err(e.message));
