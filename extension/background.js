/**
 * NomFeed Chrome Extension — Background Service Worker
 */

const DEFAULT_SERVER = "http://localhost:24242";
const SETTINGS_KEYS = ["serverUrl", "lastExtract", "lastPatterns"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-page",
      title: "Save page to NomFeed",
      contexts: ["page", "link"],
    });

    chrome.contextMenus.create({
      id: "save-selection",
      title: "Save selection to NomFeed",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let payload = {};

  if (info.menuItemId === "save-selection" && info.selectionText) {
    payload = {
      url: tab?.url || info.pageUrl,
      title: tab?.title,
      selection: info.selectionText,
    };
  } else if (info.menuItemId === "save-page") {
    payload = info.linkUrl
      ? { url: info.linkUrl }
      : { url: tab?.url || info.pageUrl, title: tab?.title };
  } else {
    return;
  }

  await addToNomFeed(payload, tab?.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender).then(sendResponse);
  return true;
});

async function handleRuntimeMessage(message, sender) {
  switch (message?.type) {
    case "ping":
      return { ok: true };

    case "save-current-tab":
    case "nomfeed:save-page":
      return handleSavePage(message, sender);

    case "nomfeed:save-twitter-artifact":
      return handleSaveTwitterArtifact(message, sender);

    case "nomfeed:save-annotation":
      return handleSaveAnnotation(message, sender);

    case "nomfeed:save-capture":
      return handleSaveCapture(message, sender);

    case "nomfeed:capture-visible-tab":
      return captureVisibleTab(sender);

    case "nomfeed:get-state":
      return getExtensionState();

    case "nomfeed:focus-page-deck":
      return focusPageDeck(message);

    case "nomfeed:start-annotation":
      return startAnnotation(message);

    default:
      return { ok: false, error: `Unknown message type: ${message?.type || "missing"}` };
  }
}

async function getExtensionState() {
  const settings = await getStoredSettings();
  const patternState = await loadPatternState(settings.serverUrl);

  return {
    ok: true,
    data: {
      ...settings,
      patterns: patternState.patterns,
      llmConfigured: patternState.llmConfigured,
      serverReachable: patternState.serverReachable,
    },
  };
}

async function handleSavePage(message, sender) {
  const tab = await resolveTab(sender, message);

  if (!tab?.url) {
    return { ok: false, error: "No active tab" };
  }

  const payload = {
    url: tab.url,
    title: cleanText(message.title) || tab.title,
    tags: sanitizeList(message.tags),
  };

  const selection = cleanText(message.selection);
  if (selection) {
    payload.selection = selection;
  }

  let patterns = [];
  if (message.extract) {
    patterns = await resolveExtractPatterns(message.patterns);
    payload.extract = true;
    if (patterns.length) {
      payload.patterns = patterns;
    }
  }

  const result = await addToNomFeed(payload, tab.id);

  if (result.ok) {
    await persistCapturePreferences(Boolean(message.extract), patterns);
  }

  return result;
}

async function handleSaveTwitterArtifact(message, sender) {
  const tab = await resolveTab(sender, message);

  if (!tab?.url) {
    return { ok: false, error: "No active tab" };
  }

  const artifactPayload = buildTwitterArtifactPayload(tab, message);
  const result = await addToNomFeed(
    {
      url: artifactPayload.url,
      title: artifactPayload.pageTitle || cleanText(message.title) || tab.title,
      tags: mergeTagLists(sanitizeList(message.tags), ["twitter", "x-bookmark"]),
      artifact: {
        type: "twitter",
        title: cleanText(message.artifactTitle),
        tags: mergeTagLists(sanitizeList(message.tags), ["twitter", "x-bookmark"]),
        twitter: artifactPayload,
      },
    },
    tab.id
  );

  return result;
}

async function handleSaveAnnotation(message, sender) {
  const tab = await resolveTab(sender, message);
  const noteText = cleanText(message.note);
  const selection = cleanText(message.selection);

  if (!tab?.url) {
    return { ok: false, error: "No active tab" };
  }

  if (!noteText && !selection) {
    return { ok: false, error: "Add a note or select text first" };
  }

  const note = buildAnnotationMarkdown({
    noteText,
    pageTitle: tab.title || "Untitled page",
    pageUrl: tab.url,
    selection,
  });

  return addToNomFeed(
    {
      note,
      title: cleanText(message.title) || `Annotation: ${tab.title || tab.url}`,
      tags: ["annotation", ...sanitizeList(message.tags)],
    },
    tab.id
  );
}

async function handleSaveCapture(message, sender) {
  const tab = await resolveTab(sender, message);

  if (!tab?.url) {
    return { ok: false, error: "No active tab" };
  }

  const itemResponse = await addToNomFeed(
    {
      url: tab.url,
      title: cleanText(message.title) || tab.title,
      tags: sanitizeList(message.tags),
    },
    tab.id
  );

  if (!itemResponse?.ok) {
    return itemResponse;
  }

  const serverUrl = await getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/items/${itemResponse.data.id}/captures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(message.payload || {}),
        url: tab.url,
        title: cleanText(message.title) || tab.title,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      showBadge(tab.id, "✗", "#ef4444");
      return {
        ok: false,
        error: data?.error || `Capture save failed (${response.status})`,
      };
    }

    showBadge(tab.id, "✓", "#22c55e");
    return {
      ok: true,
      data: {
        item: itemResponse.data,
        capture: data.data,
      },
    };
  } catch (error) {
    console.error("NomFeed: Failed to save capture", error);
    showBadge(tab.id, "!", "#f59e0b");
    return {
      ok: false,
      error: `Cannot connect to nomfeed server at ${serverUrl}.\nRun: nomfeed serve`,
    };
  }
}

async function focusPageDeck(message) {
  const tab = await resolveTab(null, message);

  if (!tab?.id) {
    return { ok: false, error: "No active tab" };
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, {
      type: "nomfeed:focus-page-deck",
      mode: message.mode || "default",
    });
  } catch {
    return {
      ok: false,
      error: "NomFeed page deck is unavailable on this page",
    };
  }
}

async function startAnnotation(message) {
  const tab = await resolveTab(null, message);

  if (!tab?.id) {
    return { ok: false, error: "No active tab" };
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "nomfeed:start-annotation" });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "NomFeed annotation tools are unavailable on this page",
    };
  }
}

async function captureVisibleTab(sender) {
  if (!sender?.tab?.windowId) {
    return { ok: false, error: "No browser window available" };
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function addToNomFeed(payload, tabId) {
  const serverUrl = await getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      showBadge(tabId, "✗", "#ef4444");
      return {
        ok: false,
        error: data?.error || `NomFeed request failed (${response.status})`,
      };
    }

    showBadge(tabId, "✓", "#22c55e");
    return data;
  } catch (error) {
    console.error("NomFeed: Failed to save", error);
    showBadge(tabId, "!", "#f59e0b");
    return {
      ok: false,
      error: `Cannot connect to nomfeed server at ${serverUrl}.\nRun: nomfeed serve`,
    };
  }
}

async function getServerUrl() {
  const { serverUrl } = await getStoredSettings();
  return serverUrl;
}

async function getStoredSettings() {
  try {
    const result = await chrome.storage.local.get(SETTINGS_KEYS);
    return {
      serverUrl: normalizeServerUrl(result.serverUrl),
      lastExtract: Boolean(result.lastExtract),
      lastPatterns: sanitizeList(result.lastPatterns),
    };
  } catch {
    return {
      serverUrl: DEFAULT_SERVER,
      lastExtract: false,
      lastPatterns: [],
    };
  }
}

async function loadPatternState(serverUrl) {
  try {
    const response = await fetch(`${serverUrl}/patterns`);
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Failed to load patterns");
    }

    return {
      patterns: Array.isArray(data.data) ? data.data : [],
      llmConfigured: Boolean(data.llmConfigured),
      serverReachable: true,
    };
  } catch {
    return {
      patterns: [],
      llmConfigured: false,
      serverReachable: false,
    };
  }
}

async function resolveTab(sender, message) {
  if (sender?.tab) {
    return sender.tab;
  }

  if (message?.tabId) {
    try {
      return await chrome.tabs.get(message.tabId);
    } catch {
      return null;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function resolveExtractPatterns(patterns) {
  const requested = sanitizeList(patterns);
  if (requested.length) {
    return requested;
  }

  const settings = await getStoredSettings();
  return settings.lastPatterns;
}

async function persistCapturePreferences(extract, patterns) {
  const update = { lastExtract: extract };
  const sanitizedPatterns = sanitizeList(patterns);

  if (extract && sanitizedPatterns.length) {
    update.lastPatterns = sanitizedPatterns;
  }

  try {
    await chrome.storage.local.set(update);
  } catch {
    // Ignore storage errors; capture should still succeed.
  }
}

function buildAnnotationMarkdown({ noteText, pageTitle, pageUrl, selection }) {
  const lines = [
    "# Page Annotation",
    "",
    `Page: ${pageTitle}`,
    `URL: ${pageUrl}`,
    `Captured: ${new Date().toISOString()}`,
  ];

  if (selection) {
    lines.push("", "## Selected Text", "", quoteBlock(selection));
  }

  if (noteText) {
    lines.push("", "## Annotation", "", noteText);
  }

  return lines.join("\n");
}

function buildTwitterArtifactPayload(tab, message) {
  const pageUrl = cleanText(message.pageUrl) || tab.url || "";
  const normalizedHandle = normalizeHandle(message.authorHandle) || inferTwitterHandleFromUrl(pageUrl);
  const tweetId = cleanText(message.tweetId) || inferTweetIdFromUrl(pageUrl);
  const hashtags = sanitizeList(message.hashtags).map((tag) => tag.replace(/^#/, ""));
  const mentions = sanitizeList(message.mentions).map((mention) => normalizeHandle(mention)).filter(Boolean);
  const urls = sanitizeList(message.urls);
  const media = normalizeTwitterMedia(message.media);

  return {
    url: pageUrl,
    tweetId,
    authorHandle: normalizedHandle,
    authorName: cleanText(message.authorName),
    text: cleanText(message.text) || cleanText(message.selection),
    createdAt: cleanText(message.createdAt),
    bookmarkedAt: cleanText(message.bookmarkedAt) || new Date().toISOString(),
    conversationId: cleanText(message.conversationId),
    inReplyToTweetId: cleanText(message.inReplyToTweetId),
    quotedTweetId: cleanText(message.quotedTweetId),
    captureKind: cleanText(message.captureKind) || "bookmark",
    pageTitle: cleanText(message.pageTitle) || tab.title || "",
    hashtags,
    mentions,
    urls,
    media,
    threadTweetIds: sanitizeList(message.threadTweetIds),
    source: {
      mode: cleanText(message.sourceMode) || "extension",
      pageUrl,
      capturedAt: new Date().toISOString(),
    },
    raw: message.raw,
  };
}

function normalizeTwitterMedia(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .filter((value) => value && typeof value.url === "string" && value.url.trim())
    .map((value) => ({
      type: ["photo", "video", "gif", "link"].includes(value.type) ? value.type : "link",
      url: value.url.trim(),
      ...(typeof value.previewUrl === "string" && value.previewUrl.trim() ? { previewUrl: value.previewUrl.trim() } : {}),
      ...(typeof value.altText === "string" && value.altText.trim() ? { altText: value.altText.trim() } : {}),
    }));
}

function inferTweetIdFromUrl(url) {
  const match = cleanText(url).match(/\/status\/(\d+)/i);
  return match ? match[1] : "";
}

function inferTwitterHandleFromUrl(url) {
  const value = cleanText(url);
  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) {
      return "";
    }
    const handle = parts[0];
    if (["i", "home", "explore", "search"].includes(handle)) {
      return "";
    }
    return normalizeHandle(handle);
  } catch {
    return "";
  }
}

function normalizeHandle(value) {
  const cleaned = cleanText(value).replace(/^@+/, "");
  return cleaned || "";
}

function mergeTagLists(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function quoteBlock(text) {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function sanitizeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeServerUrl(url) {
  const cleaned = cleanText(url).replace(/\/+$/, "");
  return cleaned || DEFAULT_SERVER;
}

function showBadge(tabId, text, color) {
  if (!tabId) {
    return;
  }

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });

  setTimeout(() => {
    chrome.action.setBadgeText({ text: "", tabId });
  }, 2500);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "annotate-page") {
    return;
  }

  try {
    await startAnnotation({});
  } catch (error) {
    console.error("NomFeed: failed to start annotation from shortcut", error);
  }
});
