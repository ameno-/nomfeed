/**
 * MarkStash Chrome Extension — Background Service Worker
 */

const DEFAULT_SERVER = "http://localhost:24242";

async function getServerUrl() {
  try {
    const result = await chrome.storage.local.get("serverUrl");
    return result.serverUrl || DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
}

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  // Remove existing menus first to avoid duplicates on update
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-page",
      title: "Save page to MarkStash",
      contexts: ["page", "link"],
    });

    chrome.contextMenus.create({
      id: "save-selection",
      title: "Save selection to MarkStash",
      contexts: ["selection"],
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const serverUrl = await getServerUrl();
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
  }

  try {
    const resp = await fetch(`${serverUrl}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    showBadge(tab?.id, data.ok ? "✓" : "✗", data.ok ? "#22c55e" : "#ef4444");
  } catch (e) {
    console.error("MarkStash: Failed to save", e);
    showBadge(tab?.id, "!", "#f59e0b");
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "save-current-tab") {
    handleSaveCurrentTab(message).then(sendResponse);
    return true; // async
  }
  if (message.type === "ping") {
    sendResponse({ ok: true });
    return false;
  }
});

async function handleSaveCurrentTab(message) {
  const serverUrl = await getServerUrl();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) return { ok: false, error: "No active tab" };

  try {
    const resp = await fetch(`${serverUrl}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: tab.url,
        title: message.title || tab.title,
        tags: message.tags || [],
      }),
    });
    return await resp.json();
  } catch (e) {
    return {
      ok: false,
      error: `Cannot connect to markstash server at ${serverUrl}.\nRun: markstash serve`,
    };
  }
}

function showBadge(tabId, text, color) {
  if (!tabId) return;
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "", tabId });
  }, 2500);
}
