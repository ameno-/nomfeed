/**
 * MarkStash Chrome Extension — Background Service Worker
 *
 * Handles:
 * - Context menu "Save to MarkStash"
 * - Communication with local markstash server
 */

const DEFAULT_SERVER = "http://localhost:24242";

// Get server URL from storage or use default
async function getServerUrl() {
  const result = await chrome.storage.local.get("serverUrl");
  return result.serverUrl || DEFAULT_SERVER;
}

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-markstash",
    title: "Save to MarkStash",
    contexts: ["page", "selection", "link"],
  });

  chrome.contextMenus.create({
    id: "save-selection-to-markstash",
    title: "Save selection to MarkStash",
    contexts: ["selection"],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const serverUrl = await getServerUrl();

  let payload = {};

  if (info.menuItemId === "save-selection-to-markstash" && info.selectionText) {
    payload = {
      url: tab?.url || info.pageUrl,
      title: tab?.title,
      selection: info.selectionText,
    };
  } else if (info.menuItemId === "save-to-markstash") {
    if (info.linkUrl) {
      payload = { url: info.linkUrl };
    } else {
      payload = {
        url: tab?.url || info.pageUrl,
        title: tab?.title,
      };
    }
  }

  try {
    const resp = await fetch(`${serverUrl}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (data.ok) {
      // Show success badge
      chrome.action.setBadgeText({ text: "✓", tabId: tab?.id });
      chrome.action.setBadgeBackgroundColor({ color: "#22c55e", tabId: tab?.id });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "", tabId: tab?.id });
      }, 2000);
    } else {
      chrome.action.setBadgeText({ text: "✗", tabId: tab?.id });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId: tab?.id });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "", tabId: tab?.id });
      }, 3000);
    }
  } catch (e) {
    console.error("MarkStash: Failed to save", e);
    chrome.action.setBadgeText({ text: "!", tabId: tab?.id });
    chrome.action.setBadgeBackgroundColor({ color: "#f59e0b", tabId: tab?.id });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "", tabId: tab?.id });
    }, 3000);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "save-current-tab") {
    handleSaveCurrentTab(message).then(sendResponse);
    return true; // async response
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
    return { ok: false, error: `Cannot connect to markstash server at ${serverUrl}. Run: markstash serve` };
  }
}
