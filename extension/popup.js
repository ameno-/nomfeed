/**
 * MarkStash Chrome Extension — Popup Script
 */

const urlEl = document.getElementById("url");
const titleEl = document.getElementById("title");
const tagsEl = document.getElementById("tags");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");
const settingsToggle = document.getElementById("settings-toggle");
const settingsDiv = document.getElementById("settings");
const serverUrlEl = document.getElementById("serverUrl");
const saveSettingsBtn = document.getElementById("save-settings");

// Load current tab info
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab) {
    urlEl.textContent = tab.url;
    titleEl.value = tab.title || "";
  }
});

// Load saved server URL
chrome.storage.local.get("serverUrl", (result) => {
  serverUrlEl.value = result.serverUrl || "http://localhost:24242";
});

// Save button
saveBtn.addEventListener("click", async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  statusEl.textContent = "";
  statusEl.className = "status";

  const tags = tagsEl.value
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  chrome.runtime.sendMessage(
    {
      type: "save-current-tab",
      title: titleEl.value,
      tags,
    },
    (response) => {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save to MarkStash";

      if (response?.ok) {
        statusEl.textContent = `✓ Saved (${response.data?.id})`;
        statusEl.className = "status success";
      } else {
        statusEl.textContent = response?.error || "Failed to save";
        statusEl.className = "status error";
      }
    }
  );
});

// Settings toggle
settingsToggle.addEventListener("click", () => {
  settingsDiv.classList.toggle("visible");
});

// Save settings
saveSettingsBtn.addEventListener("click", () => {
  const url = serverUrlEl.value.replace(/\/$/, "");
  chrome.storage.local.set({ serverUrl: url }, () => {
    saveSettingsBtn.textContent = "Saved!";
    setTimeout(() => {
      saveSettingsBtn.textContent = "Save Settings";
    }, 1500);
  });
});

// Enter key to save
titleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});

tagsEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});
