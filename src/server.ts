/**
 * HTTP Server — local endpoint for Chrome extension and external tools.
 *
 * POST /add             { url, title?, tags?, selection?, extract?, patterns? }
 * GET  /items           List all items (?query=&tag=&type=&limit=)
 * GET  /items/:id       Read item + content
 * DELETE /items/:id     Delete item
 * GET  /search?q=       Full-text search
 * GET  /patterns        List available extraction patterns
 * GET  /health          Health check
 */

import { addItem, listItems, readContent, getItem, deleteItem, searchContent, itemCount } from "./store";
import { urlToMarkdown, fileToMarkdown, noteToMarkdown } from "./convert";
import { extract } from "./extract";
import { listPatterns, DEFAULT_EXTRACT_PATTERNS } from "./patterns";
import { isConfigured } from "./llm";

export async function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      try {
        // ── POST /add ────────────────────────────────────────────────────
        if (path === "/add" && req.method === "POST") {
          const body = await req.json() as any;

          if (!body.url && !body.file && !body.note) {
            return json({ ok: false, error: "Provide url, file, or note" }, 400, corsHeaders);
          }

          let result: { title: string; markdown: string; strategy?: string };
          let type: "url" | "file" | "note";
          let source: string;

          if (body.url) {
            type = "url";
            source = body.url;
            result = await urlToMarkdown(body.url);

            if (body.selection) {
              result.markdown = `> **Selected text:**\n> ${body.selection}\n\n---\n\n${result.markdown}`;
            }
          } else if (body.file) {
            type = "file";
            source = body.file;
            result = await fileToMarkdown(body.file);
          } else {
            type = "note";
            source = "note";
            result = noteToMarkdown(body.note, body.title);
          }

          // Run extraction if requested and LLM is configured
          let extracted = false;
          if (body.extract && isConfigured()) {
            const patternNames = Array.isArray(body.patterns) && body.patterns.length
              ? body.patterns
              : DEFAULT_EXTRACT_PATTERNS;

            try {
              const extraction = await extract(result.markdown, patternNames);
              result.markdown = result.markdown + "\n\n---\n\n# Extraction\n\n" + extraction.composed;
              extracted = true;
            } catch {
              // Extraction failed — save without it
            }
          }

          const item = addItem({
            type,
            source,
            title: body.title || result.title,
            markdown: result.markdown,
            tags: body.tags || [],
            strategy: result.strategy,
          });

          return json({ ok: true, data: { ...item, extracted } }, 200, corsHeaders);
        }

        // ── GET /patterns ────────────────────────────────────────────────
        if (path === "/patterns" && req.method === "GET") {
          const patterns = listPatterns();
          const defaults = new Set(DEFAULT_EXTRACT_PATTERNS);
          const data = patterns.map(p => ({
            name: p.name,
            description: p.description,
            default: defaults.has(p.name),
          }));
          return json({ ok: true, data, llmConfigured: isConfigured() }, 200, corsHeaders);
        }

        // ── GET /items ───────────────────────────────────────────────────
        if (path === "/items" && req.method === "GET") {
          const items = listItems({
            query: url.searchParams.get("query") || undefined,
            tag: url.searchParams.get("tag") || undefined,
            type: url.searchParams.get("type") || undefined,
            limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : undefined,
          });
          return json({ ok: true, data: items }, 200, corsHeaders);
        }

        // ── GET /items/:id ───────────────────────────────────────────────
        const itemMatch = path.match(/^\/items\/([^/]+)$/);
        if (itemMatch && req.method === "GET") {
          const id = itemMatch[1];
          const item = getItem(id);
          if (!item) return json({ ok: false, error: "Not found" }, 404, corsHeaders);

          const content = readContent(id);
          return json({ ok: true, data: { ...item, content } }, 200, corsHeaders);
        }

        // ── DELETE /items/:id ────────────────────────────────────────────
        if (itemMatch && req.method === "DELETE") {
          const id = itemMatch[1];
          if (deleteItem(id)) {
            return json({ ok: true, data: { deleted: id } }, 200, corsHeaders);
          }
          return json({ ok: false, error: "Not found" }, 404, corsHeaders);
        }

        // ── GET /search ──────────────────────────────────────────────────
        if (path === "/search" && req.method === "GET") {
          const q = url.searchParams.get("q") || url.searchParams.get("query") || "";
          if (!q) return json({ ok: false, error: "Provide ?q= parameter" }, 400, corsHeaders);

          const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!) : 20;
          const results = searchContent(q, limit);
          return json({ ok: true, data: results }, 200, corsHeaders);
        }

        // ── GET /health ──────────────────────────────────────────────────
        if (path === "/health") {
          return json({ ok: true, items: itemCount(), llmConfigured: isConfigured() }, 200, corsHeaders);
        }

        return json({ ok: false, error: "Not found" }, 404, corsHeaders);
      } catch (e: any) {
        return json({ ok: false, error: e.message }, 500, corsHeaders);
      }
    },
  });

  console.log(`nomfeed server running on http://localhost:${port}`);
  console.log(`  POST /add          — Save URL/file/note (+ optional extract)`);
  console.log(`  GET  /patterns     — List extraction patterns`);
  console.log(`  GET  /items        — List items`);
  console.log(`  GET  /items/:id    — Read item`);
  console.log(`  DELETE /items/:id  — Delete item`);
  console.log(`  GET  /search?q=    — Search content`);
  console.log(`  GET  /health       — Health check`);
  console.log(`\nPress Ctrl+C to stop.`);
}

function json(data: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
