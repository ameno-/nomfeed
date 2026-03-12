document.addEventListener("DOMContentLoaded", async () => {
  const pageTitleEl = document.getElementById("pageTitle");
  const pageUrlEl = document.getElementById("pageUrl");
  const openDeckBtn = document.getElementById("openDeck");
  const savePageBtn = document.getElementById("savePage");
  const saveExtractBtn = document.getElementById("saveExtract");
  const saveTweetBtn = document.getElementById("saveTweet");
  const annotatePageBtn = document.getElementById("annotatePage");
  const twitterPanelEl = document.getElementById("twitterPanel");
  const twitterMetaEl = document.getElementById("twitterMeta");
  const extractMetaEl = document.getElementById("extractMeta");
  const patternsEl = document.getElementById("patterns");
  const statusEl = document.getElementById("status");
  const cliOutputEl = document.getElementById("cliOutput");
  const settingsToggleEl = document.getElementById("settingsToggle");
  const settingsEl = document.getElementById("settings");
  const serverUrlEl = document.getElementById("serverUrl");
  const saveSettingsBtn = document.getElementById("saveSettings");

  let selectedPatterns = new Set();
  let llmConfigured = false;
  let isTwitterContext = false;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageTitleEl.textContent = tab?.title || "No active tab";
  pageUrlEl.textContent = tab?.url || "";
  isTwitterContext = isTwitterUrl(tab?.url || "");
  twitterPanelEl.hidden = !isTwitterContext;
  if (isTwitterContext) {
    twitterMetaEl.textContent = describeTwitterContext(tab?.url || "");
  }

  async function sendMessage(message) {
    return await chrome.runtime.sendMessage(message);
  }

  function setStatus(text, tone = "") {
    statusEl.textContent = text;
    statusEl.className = tone ? `status ${tone}` : "status";
  }

  function showCliCommands(id, extracted = false) {
    const commands = [`nomfeed read ${id} --bundle`];
    if (extracted) commands.push(`nomfeed read ${id} --full`);
    cliOutputEl.textContent = commands.join("\n");
    cliOutputEl.classList.add("visible");
  }

  function isTwitterUrl(url) {
    return /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i.test(url || "");
  }

  function inferTweetId(url) {
    const match = String(url || "").match(/\/status\/(\d+)/i);
    return match ? match[1] : "";
  }

  function inferHandle(url) {
    try {
      const parsed = new URL(url || "");
      const [first] = parsed.pathname.split("/").filter(Boolean);
      if (!first || ["i", "home", "explore", "search"].includes(first)) {
        return "";
      }
      return first.replace(/^@+/, "");
    } catch {
      return "";
    }
  }

  function describeTwitterContext(url) {
    const handle = inferHandle(url);
    const tweetId = inferTweetId(url);
    if (handle && tweetId) {
      return `Ready to save tweet ${tweetId} from @${handle} as a Twitter artifact.`;
    }
    if (handle) {
      return `Ready to save Twitter/X context for @${handle}.`;
    }
    return "Ready to save this Twitter/X page as an additive NomFeed artifact.";
  }

  function renderPatterns(patterns) {
    patternsEl.innerHTML = "";
    if (!llmConfigured) return;

    if (!selectedPatterns.size) {
      patterns.forEach((pattern) => {
        if (pattern.default) selectedPatterns.add(pattern.name);
      });
    }

    patterns.forEach((pattern) => {
      const chip = document.createElement("span");
      chip.className = "chip" + (selectedPatterns.has(pattern.name) ? " selected" : "");
      chip.textContent = pattern.name.replace(/_/g, " ");
      chip.title = pattern.description;
      chip.addEventListener("click", () => {
        if (selectedPatterns.has(pattern.name)) {
          selectedPatterns.delete(pattern.name);
          chip.classList.remove("selected");
        } else {
          selectedPatterns.add(pattern.name);
          chip.classList.add("selected");
        }
        chrome.storage.local.set({ lastPatterns: [...selectedPatterns] });
        extractMetaEl.textContent = selectedPatterns.size
          ? `Save + Extract uses: ${[...selectedPatterns].join(", ")}`
          : "Save + Extract uses your server defaults.";
      });
      patternsEl.appendChild(chip);
    });
  }

  async function refreshState() {
    const response = await sendMessage({ type: "nomfeed:get-state" });
    const data = response?.data || {};
    serverUrlEl.value = data.serverUrl || "http://localhost:24242";
    llmConfigured = Boolean(data.llmConfigured);
    selectedPatterns = new Set(Array.isArray(data.lastPatterns) ? data.lastPatterns : []);

    if (!data.serverReachable) {
      extractMetaEl.textContent = "NomFeed server is unreachable. Start it with: nomfeed serve";
      saveExtractBtn.disabled = true;
      return;
    }

    if (!llmConfigured) {
      extractMetaEl.textContent = "Save + Extract stays disabled until OPENROUTER_API_KEY is configured.";
      saveExtractBtn.disabled = true;
      renderPatterns([]);
      return;
    }

    saveExtractBtn.disabled = false;
    renderPatterns(Array.isArray(data.patterns) ? data.patterns : []);
    extractMetaEl.textContent = selectedPatterns.size
      ? `Save + Extract uses: ${[...selectedPatterns].join(", ")}`
      : "Save + Extract uses your server defaults.";
  }

  async function runAction(button, busyText, fn) {
    const idleText = button.textContent;
    button.disabled = true;
    setStatus("");
    try {
      button.textContent = busyText;
      const response = await fn();
      if (response?.ok) {
        const data = response.data?.capture ? response.data.item : response.data;
        const id = data?.id || response.data?.item?.id;
        const extracted = Boolean(data?.extracting);
        setStatus(response.data?.capture ? `Capture saved on ${id}.` : extracted ? `Saved. Extraction queued for ${id}.` : `Saved page (${id}).`, "success");
        if (id) showCliCommands(id, extracted);
      } else {
        setStatus(response?.error || "NomFeed action failed.", "error");
      }
    } catch (error) {
      setStatus(String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = idleText;
      refreshState();
    }
  }

  openDeckBtn.addEventListener("click", async () => {
    const response = await sendMessage({ type: "nomfeed:focus-page-deck", mode: "default" });
    setStatus(response?.ok ? "Page tools opened on the current tab." : (response?.error || "Could not open page tools."), response?.ok ? "success" : "error");
    if (response?.ok) window.close();
  });

  savePageBtn.addEventListener("click", () => runAction(savePageBtn, "Saving...", () => (
    sendMessage({
      type: "save-current-tab",
      title: tab?.title || "",
    })
  )));

  saveExtractBtn.addEventListener("click", () => runAction(saveExtractBtn, "Saving + extracting...", () => (
    sendMessage({
      type: "save-current-tab",
      title: tab?.title || "",
      extract: true,
      patterns: [...selectedPatterns],
    })
  )));

  if (saveTweetBtn) {
    saveTweetBtn.addEventListener("click", () => runAction(saveTweetBtn, "Saving tweet...", () => (
      sendMessage({
        type: "nomfeed:save-twitter-artifact",
        title: tab?.title || "",
        pageTitle: tab?.title || "",
        pageUrl: tab?.url || "",
        tweetId: inferTweetId(tab?.url || ""),
        authorHandle: inferHandle(tab?.url || ""),
        captureKind: inferTweetId(tab?.url || "") ? "tweet" : "bookmark",
        sourceMode: "extension",
      })
    )));
  }

  annotatePageBtn.addEventListener("click", async () => {
    const response = await sendMessage({ type: "nomfeed:start-annotation" });
    setStatus(response?.ok ? "Annotation mode started on the page." : (response?.error || "Could not start annotation mode."), response?.ok ? "success" : "error");
    if (response?.ok) window.close();
  });

  cliOutputEl.addEventListener("click", async () => {
    if (!cliOutputEl.textContent) return;
    await navigator.clipboard.writeText(cliOutputEl.textContent);
    setStatus("CLI command copied.", "success");
  });

  settingsToggleEl.addEventListener("click", (event) => {
    event.preventDefault();
    settingsEl.classList.toggle("visible");
  });

  saveSettingsBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({
      serverUrl: serverUrlEl.value.replace(/\/+$/, ""),
      lastPatterns: [...selectedPatterns],
    });
    setStatus("Settings saved.", "success");
    await refreshState();
  });

  await refreshState();
});
