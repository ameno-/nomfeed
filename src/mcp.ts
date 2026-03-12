/**
 * MCP Server — Model Context Protocol over stdio.
 *
 * Tools:
 *   nomfeed_add     — Save URL, file, or note
 *   nomfeed_list    — List saved items
 *   nomfeed_read    — Read markdown content
 *   nomfeed_search  — Full-text search
 *   nomfeed_delete  — Remove item
 *   nomfeed_status  — Stats
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addItem,
  deleteItem,
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
import { isConfigured } from "./llm";

export async function startMcp() {
  const server = new McpServer({
    name: "nomfeed",
    version: "1.0.0",
  });

  // ── nomfeed_add ────────────────────────────────────────────────────────

  server.tool(
    "nomfeed_add",
    "Save a URL, file, or note as markdown. URLs are fetched and converted. Files are converted via markitdown. Notes are saved as-is.",
    {
      url: z.string().optional().describe("URL to fetch and convert to markdown"),
      file: z.string().optional().describe("Local file path to convert to markdown"),
      note: z.string().optional().describe("Text note to save directly"),
      title: z.string().optional().describe("Override the auto-detected title"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
    },
    async ({ url, file, note, title, tags }) => {
      if (!url && !file && !note) {
        return { content: [{ type: "text" as const, text: "Error: provide url, file, or note" }] };
      }

      try {
        let result: { title: string; markdown: string };
        let type: "url" | "file" | "note";
        let source: string;

        if (url) {
          type = "url";
          source = url;
          result = await urlToMarkdown(url);
        } else if (file) {
          type = "file";
          source = file;
          result = await fileToMarkdown(file);
        } else {
          type = "note";
          source = "note";
          result = noteToMarkdown(note!, title);
        }

        const item = addItem({
          type,
          source,
          title: title || result.title,
          markdown: result.markdown,
          tags,
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ok: true, data: item }, null, 2),
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }] };
      }
    }
  );

  // ── nomfeed_list ───────────────────────────────────────────────────────

  server.tool(
    "nomfeed_list",
    "List saved items. Optionally filter by query, tag, or type.",
    {
      query: z.string().optional().describe("Filter by title/source substring"),
      tag: z.string().optional().describe("Filter by tag"),
      type: z.enum(["url", "file", "note"]).optional().describe("Filter by type"),
      limit: z.number().optional().describe("Max items to return"),
      hasCaptures: z.boolean().optional().describe("Only return items that have annotation captures"),
    },
    async ({ query, tag, type, limit, hasCaptures }) => {
      const items = listItems({ query, tag, type, limit, hasCaptures });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ ok: true, data: items, total: items.length }, null, 2),
        }],
      };
    }
  );

  // ── nomfeed_read ───────────────────────────────────────────────────────

  server.tool(
    "nomfeed_read",
    "Read content of a saved item. Use mode='extract' for just the extraction, mode='full' for content + extraction, mode='captures' for captures only, mode='bundle' for the full page bundle.",
    {
      id: z.string().describe("Item ID"),
      mode: z.enum(["content", "extract", "full", "captures", "bundle"]).optional().describe("What to read"),
    },
    async ({ id, mode }) => {
      const item = getItem(id);
      if (!item) {
        return { content: [{ type: "text" as const, text: "Error: item not found" }] };
      }

      const m = mode || "content";
      const mainContent = readContent(id);
      const extraction = readExtraction(id);
      const captures = listCaptures(id);
      const bundle = readBundle(id);

      let text: string;
      if (m === "extract") {
        text = extraction || "No extraction available. Use nomfeed_extract to run extraction.";
      } else if (m === "captures") {
        text = JSON.stringify(captures, null, 2);
      } else if (m === "bundle") {
        text = JSON.stringify(bundle, null, 2);
      } else if (m === "full") {
        text = (mainContent || "Content file missing");
        if (extraction) text += "\n\n---\n\n# Extraction\n\n" + extraction;
      } else {
        text = mainContent || "Content file missing";
      }

      return { content: [{ type: "text" as const, text }] };
    }
  );

  // ── nomfeed_extract ────────────────────────────────────────────────────

  server.tool(
    "nomfeed_extract",
    "Run LLM extraction patterns on a saved item. Requires OPENROUTER_API_KEY.",
    {
      id: z.string().describe("Item ID to extract from"),
      patterns: z.array(z.string()).optional().describe("Pattern names (default: extract_wisdom, video_chapters)"),
    },
    async ({ id, patterns: patternNames }) => {
      if (!isConfigured()) {
        return { content: [{ type: "text" as const, text: "Error: OPENROUTER_API_KEY not set" }] };
      }

      const content = readContent(id);
      if (!content) {
        return { content: [{ type: "text" as const, text: "Error: item not found" }] };
      }

      try {
        const names = patternNames?.length ? patternNames : DEFAULT_EXTRACT_PATTERNS;
        const extraction = await extract(content, names);
        saveExtraction(id, extraction.composed, names);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              ok: true,
              id,
              patterns: names,
              totalTokens: extraction.totalTokens,
              extraction: extraction.composed,
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }] };
      }
    }
  );

  // ── nomfeed_search ─────────────────────────────────────────────────────

  server.tool(
    "nomfeed_search",
    "Full-text search across all saved markdown content.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async ({ query, limit }) => {
      const results = searchContent(query, limit || 20);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ ok: true, data: results, total: results.length }, null, 2),
        }],
      };
    }
  );

  // ── nomfeed_delete ─────────────────────────────────────────────────────

  server.tool(
    "nomfeed_delete",
    "Delete a saved item by ID.",
    {
      id: z.string().describe("Item ID to delete"),
    },
    async ({ id }) => {
      if (deleteItem(id)) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, deleted: id }) }] };
      }
      return { content: [{ type: "text" as const, text: "Error: item not found" }] };
    }
  );

  // ── nomfeed_status ─────────────────────────────────────────────────────

  server.tool(
    "nomfeed_status",
    "Show NomFeed stats: item count and data directory.",
    {},
    async () => {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ ok: true, items: itemCount(), captures: totalCaptureCount(), dataDir: getDataDir() }),
        }],
      };
    }
  );

  // ── Start ────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
