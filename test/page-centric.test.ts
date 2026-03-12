import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startServer } from "../src/server";
import {
  addItem,
  getDataDir,
  getItem,
  listArtifacts,
  readBundle,
  saveCapture,
  saveItemArtifact,
  searchContent,
} from "../src/store";

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nX6sAAAAASUVORK5CYII=";

let dataDir = "";

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "nomfeed-page-"));
  process.env.NOMFEED_DIR = dataDir;
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.NOMFEED_DIR;
});

test("re-saving the same URL updates one page item instead of creating duplicates", () => {
  const first = addItem({
    type: "url",
    source: "https://example.com/login#cta",
    title: "Login A",
    markdown: "# Login A",
    tags: ["auth"],
    strategy: "readability",
  });

  const second = addItem({
    type: "url",
    source: "https://example.com/login",
    title: "Login B",
    markdown: "# Login B",
    tags: ["qa"],
    strategy: "jina",
  });

  expect(second.id).toBe(first.id);
  expect(getItem(first.id)?.tags).toEqual(["auth", "qa"]);
  expect(existsSync(join(getDataDir(), "items", first.id, "source.md"))).toBe(true);
  expect(readBundle(first.id)?.content).toContain("Login B");
});

test("captures become part of the page bundle and search index", () => {
  const item = addItem({
    type: "url",
    source: "https://example.com/login",
    title: "Login",
    markdown: "# Login",
    tags: ["auth"],
  });

  const capture = saveCapture(item.id, {
    url: "https://example.com/login",
    title: "Login",
    context: "Review CTA",
    mode: "debug",
    tags: ["review"],
    elements: [
      {
        selector: "#submit",
        tagName: "button",
        text: "Sign In",
        comment: "Button contrast is too weak.",
        coordinates: { x: 10, y: 20, width: 140, height: 42 },
      },
    ],
    fullPageScreenshot: PIXEL,
  });

  const bundle = readBundle(item.id);
  expect(bundle?.captures).toHaveLength(1);
  expect(bundle?.captures[0]?.id).toBe(capture.id);
  expect(bundle?.item.captureCount).toBe(1);
  expect(existsSync(bundle?.captures[0]?.screenshots[0]?.path || "")).toBe(true);

  const results = searchContent("contrast", 5);
  expect(results).toHaveLength(1);
  expect(results[0]?.id).toBe(item.id);
  expect(results[0]?.matchType).toBe("capture");
});

test("twitter artifacts become part of the page bundle and search index", () => {
  const item = addItem({
    type: "url",
    source: "https://x.com/acme/status/1234567890",
    title: "Acme tweet",
    markdown: "# Acme tweet",
    tags: ["social"],
  });

  const artifact = saveItemArtifact(item.id, {
    type: "twitter",
    tags: ["bookmark"],
    twitter: {
      url: "https://x.com/acme/status/1234567890",
      tweetId: "1234567890",
      authorHandle: "acme",
      authorName: "Acme Labs",
      text: "Gemini fast-pass clustering for bookmarks looks promising.",
      captureKind: "tweet",
      hashtags: ["ai", "agents"],
      urls: ["https://example.com/research"],
      media: [{ type: "link", url: "https://example.com/research" }],
      source: {
        mode: "extension",
        pageUrl: "https://x.com/acme/status/1234567890",
      },
      raw: { favoriteCount: 42 },
    },
  });

  const artifacts = listArtifacts(item.id);
  expect(artifacts).toHaveLength(1);
  expect(artifacts[0]?.id).toBe(artifact.id);

  const bundle = readBundle(item.id);
  expect(bundle?.artifacts).toHaveLength(1);
  expect(bundle?.item.artifactCount).toBe(1);
  expect(bundle?.item.artifactTypes).toEqual(["twitter"]);

  const results = searchContent("Gemini fast-pass", 5);
  expect(results).toHaveLength(1);
  expect(results[0]?.id).toBe(item.id);
  expect(results[0]?.matchType).toBe("artifact");
});

test("server exposes twitter artifact endpoints", async () => {
  const server = await startServer(0);

  try {
    const addResp = await fetch(`http://127.0.0.1:${server.port}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://x.com/nomfeed/status/999",
        title: "NomFeed status",
        artifact: {
          type: "twitter",
          twitter: {
            url: "https://x.com/nomfeed/status/999",
            tweetId: "999",
            authorHandle: "nomfeed",
            text: "Artifact save via /add",
            captureKind: "tweet",
            source: {
              mode: "extension",
              pageUrl: "https://x.com/nomfeed/status/999",
            },
          },
        },
      }),
    });
    const added = await addResp.json();
    expect(added.ok).toBe(true);
    expect(added.data.artifact.type).toBe("twitter");
    const itemId = added.data.id;
    const artifactId = added.data.artifact.id;

    const artifactListResp = await fetch(`http://127.0.0.1:${server.port}/items/${itemId}/artifacts`);
    const artifactList = await artifactListResp.json();
    expect(artifactList.ok).toBe(true);
    expect(artifactList.data).toHaveLength(1);

    const byArtifactResp = await fetch(`http://127.0.0.1:${server.port}/artifacts/${artifactId}`);
    const byArtifact = await byArtifactResp.json();
    expect(byArtifact.ok).toBe(true);
    expect(byArtifact.data.artifact.id).toBe(artifactId);

    const bundleResp = await fetch(`http://127.0.0.1:${server.port}/items/${itemId}/bundle`);
    const bundle = await bundleResp.json();
    expect(bundle.ok).toBe(true);
    expect(bundle.data.artifacts).toHaveLength(1);
  } finally {
    server.stop(true);
  }
}, 15000);

test("server exposes bundle and capture endpoints", async () => {
  const server = await startServer(0);

  try {
    const addResp = await fetch(`http://127.0.0.1:${server.port}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: "Page-centric server smoke",
        title: "Server Smoke",
        tags: ["smoke"],
      }),
    });
    const added = await addResp.json();
    expect(added.ok).toBe(true);
    const itemId = added.data.id;

    const captureResp = await fetch(`http://127.0.0.1:${server.port}/items/${itemId}/captures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/smoke",
        title: "Server Smoke",
        mode: "basic",
        elements: [
          {
            selector: ".note",
            tagName: "div",
            comment: "Server-side capture works.",
            coordinates: { x: 0, y: 0, width: 120, height: 24 },
          },
        ],
      }),
    });
    const capture = await captureResp.json();
    expect(capture.ok).toBe(true);

    const bundleResp = await fetch(`http://127.0.0.1:${server.port}/items/${itemId}/bundle`);
    const bundle = await bundleResp.json();
    expect(bundle.ok).toBe(true);
    expect(bundle.data.captures).toHaveLength(1);

    const byCaptureResp = await fetch(`http://127.0.0.1:${server.port}/captures/${capture.data.id}`);
    const byCapture = await byCaptureResp.json();
    expect(byCapture.ok).toBe(true);
    expect(byCapture.data.capture.id).toBe(capture.data.id);
  } finally {
    server.stop(true);
  }
});

test("annotate CLI resolves an existing page item without opening the browser", async () => {
  const item = addItem({
    type: "url",
    source: "https://example.com/annotate",
    title: "Annotate Me",
    markdown: "# Annotate Me",
  });

  const proc = Bun.spawn(
    ["bun", "run", "src/cli.ts", "annotate", item.id, "--no-open", "--json"],
    {
      cwd: "/Users/ameno/dev/zed-dev/nomfeed",
      env: {
        ...process.env,
        NOMFEED_DIR: dataDir,
      },
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  expect(exitCode).toBe(0);

  const parsed = JSON.parse(output);
  expect(parsed.ok).toBe(true);
  expect(parsed.data.item.id).toBe(item.id);
  expect(parsed.data.opened).toBe(false);
  expect(parsed.data.nextStep).toContain("Annotate Page");
});
