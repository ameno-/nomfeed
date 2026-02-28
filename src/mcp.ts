/**
 * MCP Server — Model Context Protocol over stdio.
 *
 * Tools:
 *   markstash_add     — Save URL, file, or note
 *   markstash_list    — List saved items
 *   markstash_read    — Read markdown content
 *   markstash_search  — Full-text search
 *   markstash_delete  — Remove item
 *   markstash_status  — Stats
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { addItem, listItems, readContent, searchContent, deleteItem, getItem, itemCount, getDataDir } from "./store";
import { urlToMarkdown, fileToMarkdown, noteToMarkdown } from "./convert";

export async function startMcp() {
  const server = new McpServer({
    name: "markstash",
    version: "1.0.0",
  });

  // ── markstash_add ────────────────────────────────────────────────────────

  server.tool(
    "markstash_add",
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

  // ── markstash_list ───────────────────────────────────────────────────────

  server.tool(
    "markstash_list",
    "List saved items. Optionally filter by query, tag, or type.",
    {
      query: z.string().optional().describe("Filter by title/source substring"),
      tag: z.string().optional().describe("Filter by tag"),
      type: z.enum(["url", "file", "note"]).optional().describe("Filter by type"),
      limit: z.number().optional().describe("Max items to return"),
    },
    async ({ query, tag, type, limit }) => {
      const items = listItems({ query, tag, type, limit });
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ ok: true, data: items, total: items.length }, null, 2),
        }],
      };
    }
  );

  // ── markstash_read ───────────────────────────────────────────────────────

  server.tool(
    "markstash_read",
    "Read the full markdown content of a saved item.",
    {
      id: z.string().describe("Item ID"),
    },
    async ({ id }) => {
      const item = getItem(id);
      if (!item) {
        return { content: [{ type: "text" as const, text: "Error: item not found" }] };
      }

      const content = readContent(id);
      return {
        content: [{
          type: "text" as const,
          text: content || "Error: content file missing",
        }],
      };
    }
  );

  // ── markstash_search ─────────────────────────────────────────────────────

  server.tool(
    "markstash_search",
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

  // ── markstash_delete ─────────────────────────────────────────────────────

  server.tool(
    "markstash_delete",
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

  // ── markstash_status ─────────────────────────────────────────────────────

  server.tool(
    "markstash_status",
    "Show MarkStash stats: item count and data directory.",
    {},
    async () => {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ ok: true, items: itemCount(), dataDir: getDataDir() }),
        }],
      };
    }
  );

  // ── Start ────────────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
