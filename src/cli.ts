#!/usr/bin/env bun
/**
 * MarkStash CLI — dead-simple bookmark/file → markdown manager.
 *
 * Usage:
 *   markstash add <url-or-file>   Save URL or file as markdown
 *   markstash note <text>         Save a quick note
 *   markstash list [--query q]    List saved items
 *   markstash read <id>           Output markdown content
 *   markstash search <query>      Full-text search
 *   markstash delete <id>         Remove item
 *   markstash serve [--port N]    Start HTTP server (for extension)
 *   markstash mcp                 Start MCP server (stdio)
 *   markstash status              Show stats
 */

import { addItem, listItems, readContent, searchContent, deleteItem, getItem, itemCount, getDataDir } from "./store";
import { urlToMarkdown, fileToMarkdown, noteToMarkdown } from "./convert";
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

async function main() {
  switch (command) {
    // ── add ──────────────────────────────────────────────────────────────
    case "add": {
      const target = args[1];
      if (!target) err("Usage: markstash add <url-or-file>");

      const title = flag("title");
      const tags = flag("tags")?.split(",").map(t => t.trim()) || [];

      try {
        let result: { title: string; markdown: string; strategy?: string };
        let type: "url" | "file";

        if (target.startsWith("http://") || target.startsWith("https://")) {
          type = "url";
          result = await urlToMarkdown(target);
        } else {
          type = "file";
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

        out(item);
      } catch (e: any) {
        err(e.message);
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
          console.log(`  ${item.id}  ${item.type.padEnd(4)}  ${date}  ${item.title}${tags}`);
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
      out({ items: count, dataDir: dir });
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
  add <url-or-file>   Save URL or file as markdown
  note <text>         Save a quick note
  list                List saved items
  read <id>           Output markdown content  
  search <query>      Full-text search
  delete <id>         Remove item
  serve [--port N]    Start HTTP server (default: 24242)
  mcp                 Start MCP server (stdio)
  status              Show stats

Flags:
  --json              Machine-readable JSON output
  --title <t>         Override title (add/note)
  --tags <a,b>        Comma-separated tags (add/note)
  --query <q>         Filter by title/source (list)
  --tag <t>           Filter by tag (list)
  --type <url|file>   Filter by type (list)
  --limit <n>         Limit results

Examples:
  markstash add https://example.com/article
  markstash add ./report.pdf --tags work,q4
  markstash note "Remember to review the API docs"
  markstash search "machine learning" --json
  markstash read abc123 | pbcopy
`);
      break;
    }

    default:
      err(`Unknown command: ${command}. Try: markstash help`);
  }
}

main().catch(e => err(e.message));
