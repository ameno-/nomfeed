/**
 * NomFeed Chrome Extension — Popup Script
 */

document.addEventListener("DOMContentLoaded", () => {
  const urlEl = document.getElementById("url");
  const titleEl = document.getElementById("title");
  const tagsEl = document.getElementById("tags");
  const extractCheckbox = document.getElementById("extract");
  const patternsDiv = document.getElementById("patterns");
  const noLlmMsg = document.getElementById("no-llm");
  const saveBtn = document.getElementById("save");
  const statusEl = document.getElementById("status");
  const cliOutputDiv = document.getElementById("cli-output");
  const cliCmdSpan = document.getElementById("cli-cmd");
  const settingsToggle = document.getElementById("settings-toggle");
  const settingsDiv = document.getElementById("settings");
  const serverUrlEl = document.getElementById("serverUrl");
  const saveSettingsBtn = document.getElementById("save-settings");

  let availablePatterns = [];
  let selectedPatterns = new Set();
  let llmConfigured = false;

  // ── Load tab info ──────────────────────────────────────────────────────

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      urlEl.textContent = tab.url || "No URL";
      titleEl.value = tab.title || "";
    } else {
      urlEl.textContent = "No active tab";
    }
  });

  // ── Load settings ──────────────────────────────────────────────────────

  chrome.storage.local.get(["serverUrl", "lastExtract", "lastPatterns"], (result) => {
    if (result.serverUrl) serverUrlEl.value = result.serverUrl;
    if (result.lastExtract) extractCheckbox.checked = true;
    if (result.lastPatterns) {
      selectedPatterns = new Set(result.lastPatterns);
    }
    // Load patterns after restoring state
    loadPatterns();
  });

  // ── Load patterns from server ──────────────────────────────────────────

  async function loadPatterns() {
    const serverUrl = serverUrlEl.value.replace(/\/+$/, "") || "http://localhost:24242";
    try {
      const resp = await fetch(`${serverUrl}/patterns`);
      const data = await resp.json();
      if (data.ok) {
        availablePatterns = data.data;
        llmConfigured = data.llmConfigured;
        renderPatterns();
      }
    } catch {
      // Server not running — extraction won't work but saving still will
    }
  }

  function renderPatterns() {
    // Remove existing chips (keep no-llm message)
    patternsDiv.querySelectorAll(".chip").forEach((el) => el.remove());

    if (!llmConfigured) {
      noLlmMsg.style.display = "block";
      return;
    }

    noLlmMsg.style.display = "none";

    // If no saved selection, default to the defaults
    if (selectedPatterns.size === 0) {
      availablePatterns.forEach((p) => {
        if (p.default) selectedPatterns.add(p.name);
      });
    }

    availablePatterns.forEach((p) => {
      const chip = document.createElement("span");
      chip.className = "chip" + (selectedPatterns.has(p.name) ? " selected" : "");
      chip.textContent = p.name.replace(/_/g, " ");
      chip.title = p.description;
      chip.dataset.name = p.name;

      chip.addEventListener("click", () => {
        if (selectedPatterns.has(p.name)) {
          selectedPatterns.delete(p.name);
          chip.classList.remove("selected");
        } else {
          selectedPatterns.add(p.name);
          chip.classList.add("selected");
        }
      });

      patternsDiv.appendChild(chip);
    });
  }

  // ── Extract toggle ─────────────────────────────────────────────────────

  extractCheckbox.addEventListener("change", () => {
    patternsDiv.classList.toggle("visible", extractCheckbox.checked);
    // Try loading patterns if not loaded yet
    if (extractCheckbox.checked && availablePatterns.length === 0) {
      loadPatterns();
    }
  });

  // ── Save ───────────────────────────────────────────────────────────────

  saveBtn.addEventListener("click", () => {
    saveBtn.disabled = true;
    saveBtn.textContent = extractCheckbox.checked ? "Nomming + Extracting..." : "Nomming...";
    statusEl.textContent = "";
    statusEl.className = "status";
    cliOutputDiv.classList.remove("visible");

    const tags = tagsEl.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const doExtract = extractCheckbox.checked;
    const patterns = doExtract ? [...selectedPatterns] : [];

    chrome.runtime.sendMessage(
      {
        type: "save-current-tab",
        title: titleEl.value,
        tags,
        extract: doExtract,
        patterns,
      },
      (response) => {
        saveBtn.disabled = false;
        saveBtn.textContent = "\u{1F374} Nom this page";

        if (chrome.runtime.lastError) {
          statusEl.textContent = "Extension error \u2014 try reloading";
          statusEl.className = "status error";
          return;
        }

        if (response && response.ok) {
          const id = response.data?.id || "ok";
          const extracting = response.data?.extracting;
          statusEl.textContent = extracting
            ? "\u{1F37D}\uFE0F Nommed! Extracting in background... (" + id + ")"
            : "\u{1F37D}\uFE0F Nommed! (" + id + ")";
          statusEl.className = "status success";

          // Show CLI command(s)
          showCliCommand(id, extracting);

          // Remember extraction preferences
          chrome.storage.local.set({
            lastExtract: extractCheckbox.checked,
            lastPatterns: [...selectedPatterns],
          });
        } else {
          statusEl.textContent = (response && response.error) || "Failed to nom";
          statusEl.className = "status error";
        }
      }
    );
  });

  // ── CLI output ─────────────────────────────────────────────────────────

  function showCliCommand(id, extracted) {
    const commands = ["nomfeed read " + id];
    if (extracted) {
      commands.push("nomfeed read " + id + " --extract");
      commands.push("nomfeed read " + id + " --full");
    }
    cliCmdSpan.innerHTML = commands
      .map((cmd) => '<span class="cli-line">' + cmd + "</span>")
      .join("");
    cliOutputDiv.classList.add("visible");
    cliOutputDiv.classList.remove("copied");

    // Store for copy — just the first command by default
    cliOutputDiv.dataset.commands = commands.join("\n");
  }

  cliOutputDiv.addEventListener("click", () => {
    const cmd = cliOutputDiv.dataset.commands || cliCmdSpan.textContent;
    navigator.clipboard.writeText(cmd).then(() => {
      cliOutputDiv.classList.add("copied");
      cliOutputDiv.querySelector(".copy-hint").textContent = "copied!";
      setTimeout(() => {
        cliOutputDiv.classList.remove("copied");
        cliOutputDiv.querySelector(".copy-hint").textContent = "click to copy";
      }, 2000);
    });
  });

  // ── Settings ───────────────────────────────────────────────────────────

  settingsToggle.addEventListener("click", (e) => {
    e.preventDefault();
    settingsDiv.classList.toggle("visible");
  });

  saveSettingsBtn.addEventListener("click", () => {
    const url = serverUrlEl.value.replace(/\/+$/, "");
    chrome.storage.local.set({ serverUrl: url }, () => {
      saveSettingsBtn.textContent = "Saved!";
      loadPatterns(); // reload patterns from new server
      setTimeout(() => {
        saveSettingsBtn.textContent = "Save Settings";
      }, 1500);
    });
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
  });
  tagsEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveBtn.click();
  });
});
