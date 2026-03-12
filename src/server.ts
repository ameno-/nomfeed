/**
 * HTTP Server — local endpoint for Chrome extension and external tools.
 *
 * POST /add                { url, title?, tags?, selection?, extract?, patterns?, capture? }
 * GET  /items              List items (?query=&tag=&type=&limit=&hasCaptures=1)
 * GET  /items/:id          Read item + content
 * GET  /items/:id/bundle   Read full item bundle
 * GET  /items/:id/captures List captures for an item
 * POST /items/:id/captures Create a capture for an item
 * GET  /captures/:id       Read one capture by capture ID
 * DELETE /items/:id        Delete item
 * GET  /search?q=          Full-text search
 * GET  /patterns           List available extraction patterns
 * GET  /health             Health check
 */

import {
  addItem,
  deleteItem,
  findArtifact,
  findCapture,
  getItem,
  itemCount,
  listArtifacts,
  listCaptures,
  listItems,
  readBundle,
  readContent,
  readExtraction,
  saveCapture,
  saveExtraction,
  saveItemArtifact,
  searchContent,
  totalCaptureCount,
} from "./store";
import { urlToMarkdown, fileToMarkdown, noteToMarkdown } from "./convert";
import { extract } from "./extract";
import { listPatterns, DEFAULT_EXTRACT_PATTERNS } from "./patterns";
import { isConfigured } from "./llm";
import type { SaveCaptureInput } from "./capture";

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

          const item = addItem({
            type,
            source,
            title: body.title || result.title,
            markdown: result.markdown,
            tags: body.tags || [],
            strategy: result.strategy,
          });

          const capture = body.capture
            ? saveCapture(item.id, {
                ...(body.capture as SaveCaptureInput),
                url: body.capture.url || body.url || source,
                title: body.capture.title || body.title || result.title,
                tags: body.capture.tags || body.tags || [],
              })
            : null;

          const artifact = body.artifact
            ? saveItemArtifact(item.id, body.artifact)
            : null;

          // Run extraction if requested (async — don't block the response)
          let extracting = false;
          if (body.extract && isConfigured()) {
            extracting = true;
            const patternNames = Array.isArray(body.patterns) && body.patterns.length
              ? body.patterns
              : DEFAULT_EXTRACT_PATTERNS;
            const md = result.markdown;
            const id = item.id;

            // Fire and forget — extraction runs in background
            (async () => {
              try {
                const extraction = await extract(md, patternNames);
                saveExtraction(id, extraction.composed, patternNames);
                console.log(`  ✓ Extraction complete for ${id} (${extraction.totalTokens} tokens)`);
              } catch (e: any) {
                console.error(`  ✗ Extraction failed for ${id}: ${e.message}`);
              }
            })();
          }

          return json({
            ok: true,
            data: {
              ...item,
              extracting,
              ...(capture ? { capture } : {}),
              ...(artifact ? { artifact } : {}),
            },
          }, 200, corsHeaders);
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
            hasCaptures: ["1", "true", "yes"].includes((url.searchParams.get("hasCaptures") || "").toLowerCase()),
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
          const extraction = readExtraction(id);
          const data: any = { ...item, content };
          if (extraction) data.extraction = extraction;
          return json({ ok: true, data }, 200, corsHeaders);
        }

        const bundleMatch = path.match(/^\/items\/([^/]+)\/bundle$/);
        if (bundleMatch && req.method === "GET") {
          const bundle = readBundle(bundleMatch[1]);
          if (!bundle) return json({ ok: false, error: "Not found" }, 404, corsHeaders);
          return json({ ok: true, data: bundle }, 200, corsHeaders);
        }

        const captureCollectionMatch = path.match(/^\/items\/([^/]+)\/captures$/);
        if (captureCollectionMatch && req.method === "GET") {
          const item = getItem(captureCollectionMatch[1]);
          if (!item) return json({ ok: false, error: "Not found" }, 404, corsHeaders);
          return json({ ok: true, data: listCaptures(item.id) }, 200, corsHeaders);
        }

        if (captureCollectionMatch && req.method === "POST") {
          const item = getItem(captureCollectionMatch[1]);
          if (!item) return json({ ok: false, error: "Not found" }, 404, corsHeaders);
          const body = await req.json() as SaveCaptureInput;
          const capture = saveCapture(item.id, body);
          return json({ ok: true, data: capture }, 200, corsHeaders);
        }

        const artifactCollectionMatch = path.match(/^\/items\/([^/]+)\/artifacts$/);
        if (artifactCollectionMatch && req.method === "GET") {
          const item = getItem(artifactCollectionMatch[1]);
          if (!item) return json({ ok: false, error: "Not found" }, 404, corsHeaders);
          return json({ ok: true, data: listArtifacts(item.id) }, 200, corsHeaders);
        }

        if (artifactCollectionMatch && req.method === "POST") {
          const item = getItem(artifactCollectionMatch[1]);
          if (!item) return json({ ok: false, error: "Not found" }, 404, corsHeaders);
          const body = await req.json() as any;
          const artifact = saveItemArtifact(item.id, body);
          return json({ ok: true, data: artifact }, 200, corsHeaders);
        }

        const captureMatch = path.match(/^\/captures\/([^/]+)$/);
        if (captureMatch && req.method === "GET") {
          const found = findCapture(captureMatch[1]);
          if (!found) return json({ ok: false, error: "Not found" }, 404, corsHeaders);
          return json({
            ok: true,
            data: {
              item: {
                id: found.item.id,
                title: found.item.title,
                source: found.item.source,
              },
              capture: found.capture,
            },
          }, 200, corsHeaders);
        }

        const artifactMatch = path.match(/^\/artifacts\/([^/]+)$/);
        if (artifactMatch && req.method === "GET") {
          const found = findArtifact(artifactMatch[1]);
          if (!found) return json({ ok: false, error: "Not found" }, 404, corsHeaders);
          return json({
            ok: true,
            data: {
              item: {
                id: found.item.id,
                title: found.item.title,
                source: found.item.source,
              },
              artifact: found.artifact,
            },
          }, 200, corsHeaders);
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
          return json({
            ok: true,
            items: itemCount(),
            captures: totalCaptureCount(),
            llmConfigured: isConfigured(),
          }, 200, corsHeaders);
        }

        return json({ ok: false, error: "Not found" }, 404, corsHeaders);
      } catch (e: any) {
        return json({ ok: false, error: e.message }, 500, corsHeaders);
      }
    },
  });

  console.log(`nomfeed server running on http://localhost:${server.port}`);
  console.log(`  POST /add          — Save URL/file/note (+ optional extract)`);
  console.log(`  GET  /patterns     — List extraction patterns`);
  console.log(`  GET  /items        — List items`);
  console.log(`  GET  /items/:id    — Read item`);
  console.log(`  GET  /items/:id/bundle   — Read item bundle`);
  console.log(`  GET  /items/:id/captures — List captures`);
  console.log(`  POST /items/:id/captures — Create capture`);
  console.log(`  GET  /items/:id/artifacts — List item artifacts`);
  console.log(`  POST /items/:id/artifacts — Create item artifact`);
  console.log(`  GET  /captures/:id       — Read capture`);
  console.log(`  GET  /artifacts/:id      — Read artifact`);
  console.log(`  DELETE /items/:id  — Delete item`);
  console.log(`  GET  /search?q=    — Search content`);
  console.log(`  GET  /health       — Health check`);
  console.log(`\nPress Ctrl+C to stop.`);
  return server;
}

function json(data: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
