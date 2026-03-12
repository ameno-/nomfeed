(function initNomFeedPageDeck() {
  if (window.__nomfeedPageDeckInstalled) {
    return;
  }

  window.__nomfeedPageDeckInstalled = true;

  const host = document.createElement("div");
  host.id = "nomfeed-page-deck-root";

  const shadowRoot = host.attachShadow({ mode: "open" });
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        pointer-events: none;
        color: hsl(40 6% 16%);
        font-family: "Avenir Next", "SF Pro Rounded", "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      [hidden] {
        display: none !important;
      }

      .stack {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        pointer-events: auto;
      }

      .launcher {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border: 1px solid hsl(35 16% 84%);
        border-radius: 999px;
        background: hsl(44 34% 97% / 0.98);
        color: hsl(40 6% 16%);
        padding: 10px 14px;
        box-shadow: 0 14px 28px hsl(40 6% 16% / 0.12);
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease;
      }

      .launcher:hover {
        transform: translateY(-1px);
        box-shadow: 0 18px 34px hsl(40 6% 16% / 0.16);
      }

      .launcher-mark {
        width: 26px;
        height: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: hsl(100 12% 63%);
        font-size: 14px;
      }

      .launcher-copy {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
        text-align: left;
      }

      .launcher-label {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .launcher-subtitle {
        font-size: 11px;
        color: hsl(40 8% 45%);
      }

      .panel {
        width: min(320px, calc(100vw - 24px));
        border-radius: 18px;
        padding: 14px;
        background: hsl(44 34% 97% / 0.98);
        border: 1px solid hsl(35 16% 84%);
        box-shadow: 0 24px 54px hsl(40 6% 16% / 0.16);
      }

      .panel-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }

      .eyebrow {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: hsl(40 8% 45%);
        margin-bottom: 4px;
      }

      .panel-title {
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .panel-subtitle {
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.45;
        color: hsl(40 8% 45%);
      }

      .close {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid hsl(35 16% 84%);
        border-radius: 999px;
        background: hsl(40 22% 95%);
        color: hsl(40 6% 26%);
        cursor: pointer;
      }

      .section {
        padding: 11px;
        border-radius: 14px;
        border: 1px solid hsl(35 16% 86%);
        background: hsl(40 20% 95% / 0.85);
      }

      .section + .section {
        margin-top: 10px;
      }

      .section-label {
        margin-bottom: 6px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: hsl(40 8% 45%);
      }

      .page-name {
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
        color: hsl(40 6% 18%);
      }

      .page-url {
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.45;
        color: hsl(40 8% 46%);
        word-break: break-word;
      }

      .action-grid {
        display: grid;
        gap: 8px;
      }

      .action-grid.primary {
        grid-template-columns: 1fr 1fr;
      }

      .action-grid.secondary {
        grid-template-columns: 1fr;
        margin-top: 8px;
      }

      .action {
        width: 100%;
        border: 1px solid transparent;
        border-radius: 12px;
        padding: 10px 12px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        color: hsl(40 6% 16%);
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease;
      }

      .action:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 10px 22px hsl(40 6% 16% / 0.08);
      }

      .action:disabled {
        cursor: not-allowed;
        opacity: 0.58;
        box-shadow: none;
        transform: none;
      }

      .action-save {
        background: hsl(100 12% 63%);
      }

      .action-twitter {
        background: hsl(206 88% 60%);
        color: white;
      }

      .action-extract {
        background: hsl(39 84% 76%);
      }

      .action-note {
        background: hsl(40 22% 94%);
        border-color: hsl(35 16% 84%);
      }

      .meta {
        font-size: 11px;
        line-height: 1.45;
        color: hsl(40 8% 46%);
      }

      .twitter-section {
        border-color: hsl(205 55% 84%);
        background: hsl(205 100% 97% / 0.95);
      }

      .status {
        min-height: 18px;
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.4;
        color: hsl(40 8% 45%);
      }

      .status.success {
        color: hsl(100 20% 35%);
      }

      .status.error {
        color: hsl(0 48% 45%);
      }

      @media (max-width: 640px) {
        :host {
          right: 12px;
          bottom: 12px;
        }

        .panel {
          width: min(320px, calc(100vw - 16px));
          padding: 12px;
        }

        .launcher {
          padding: 10px 13px;
        }
      }
    </style>
    <div class="stack">
      <section class="panel" id="panel" hidden>
        <div class="panel-head">
          <div>
            <div class="eyebrow">Page Tools</div>
            <div class="panel-title">NomFeed command deck</div>
            <div class="panel-subtitle" id="panel-subtitle">Capture this page without leaving the current tab.</div>
          </div>
          <button class="close" id="close" type="button" aria-label="Close NomFeed panel">×</button>
        </div>

        <div class="section">
          <div class="section-label">Current Page</div>
          <div class="page-name" id="page-name">Current page</div>
          <div class="page-url" id="page-url"></div>
        </div>

        <div class="section">
          <div class="section-label">Primary Actions</div>
          <div class="action-grid primary">
            <button class="action action-save" id="save-page" type="button">Save Page</button>
            <button class="action action-twitter" id="save-twitter" type="button" hidden>Save Tweet</button>
          </div>
          <div class="action-grid secondary">
            <button class="action action-extract" id="save-extract" type="button">Save + Extract</button>
            <button class="action action-note" id="annotate-page" type="button">Annotate Page</button>
          </div>
        </div>

        <div class="section twitter-section" id="twitter-section" hidden>
          <div class="section-label">Twitter/X Enhancement</div>
          <div class="meta" id="twitter-meta">Twitter artifact capture is available on this page.</div>
        </div>

        <div class="section">
          <div class="section-label">Extraction</div>
          <div class="meta" id="meta">Save + Extract uses your saved popup pattern defaults.</div>
        </div>

        <div class="status" id="status"></div>
      </section>

      <button class="launcher" id="launcher" type="button" aria-expanded="false">
        <span class="launcher-mark">🍴</span>
        <span class="launcher-copy">
          <span class="launcher-label">NomFeed</span>
          <span class="launcher-subtitle" id="launcher-subtitle">save or annotate this page</span>
        </span>
      </button>
    </div>
  `;

  (document.documentElement || document.body || document).appendChild(host);

  const panel = shadowRoot.getElementById("panel");
  const launcher = shadowRoot.getElementById("launcher");
  const launcherSubtitle = shadowRoot.getElementById("launcher-subtitle");
  const panelSubtitle = shadowRoot.getElementById("panel-subtitle");
  const closeButton = shadowRoot.getElementById("close");
  const savePageButton = shadowRoot.getElementById("save-page");
  const saveTwitterButton = shadowRoot.getElementById("save-twitter");
  const saveExtractButton = shadowRoot.getElementById("save-extract");
  const annotateButton = shadowRoot.getElementById("annotate-page");
  const twitterSection = shadowRoot.getElementById("twitter-section");
  const twitterMeta = shadowRoot.getElementById("twitter-meta");
  const status = shadowRoot.getElementById("status");
  const meta = shadowRoot.getElementById("meta");
  const pageName = shadowRoot.getElementById("page-name");
  const pageUrl = shadowRoot.getElementById("page-url");

  const state = {
    open: false,
    busy: false,
    llmConfigured: false,
    lastPatterns: [],
    serverReachable: false,
    isTwitterContext: false,
  };

  launcher.addEventListener("click", async () => {
    if (state.open) {
      closePanel();
      return;
    }

    await openPanel();
  });

  closeButton.addEventListener("click", closePanel);

  savePageButton.addEventListener("click", async () => {
    await runPageAction({
      button: savePageButton,
      busyText: "Saving page...",
      message: {
        type: "nomfeed:save-page",
        title: document.title,
      },
    });
  });

  saveTwitterButton.addEventListener("click", async () => {
    await runPageAction({
      button: saveTwitterButton,
      busyText: "Saving tweet...",
      message: {
        type: "nomfeed:save-twitter-artifact",
        title: document.title,
        pageTitle: document.title,
        pageUrl: location.href,
        tweetId: inferTweetId(location.href),
        authorHandle: inferHandle(location.href),
        captureKind: inferTweetId(location.href) ? "tweet" : "bookmark",
        sourceMode: "page-deck",
      },
    });
  });

  saveExtractButton.addEventListener("click", async () => {
    await runPageAction({
      button: saveExtractButton,
      busyText: "Saving + extracting...",
      message: {
        type: "nomfeed:save-page",
        title: document.title,
        extract: true,
      },
    });
  });

  annotateButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("nomfeed:start-annotation"));
    closePanel();
  });

  document.addEventListener(
    "mousedown",
    (event) => {
      if (state.open && !event.composedPath().includes(host)) {
        closePanel();
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !state.open) {
        return;
      }

      closePanel();
    },
    true
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "nomfeed:focus-page-deck") {
      return false;
    }

    openPanel(message.mode).then(() => {
      if (message.mode === "annotate") {
        window.dispatchEvent(new CustomEvent("nomfeed:start-annotation"));
      }
      sendResponse({ ok: true });
    });

    return true;
  });

  async function openPanel(mode) {
    state.open = true;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    updatePageMeta();
    updateContextState();
    setStatus("", "");
    await refreshDeckState();

    if (mode === "annotate") {
      window.dispatchEvent(new CustomEvent("nomfeed:start-annotation"));
      closePanel();
    }
  }

  function closePanel() {
    state.open = false;
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
  }

  async function refreshDeckState() {
    const response = await sendMessage({ type: "nomfeed:get-state" });
    const data = response?.data || {};

    state.llmConfigured = Boolean(data.llmConfigured);
    state.lastPatterns = Array.isArray(data.lastPatterns) ? data.lastPatterns : [];
    state.serverReachable = Boolean(data.serverReachable);

    updateContextState();
    updateButtonState();

    if (!state.serverReachable) {
      meta.textContent = "NomFeed server is unreachable. Start it with: nomfeed serve";
      return;
    }

    if (!state.llmConfigured) {
      meta.textContent = "Save + Extract stays disabled until OPENROUTER_API_KEY is configured.";
      return;
    }

    if (state.lastPatterns.length) {
      meta.textContent = `Save + Extract uses: ${state.lastPatterns.join(", ")}`;
      return;
    }

    meta.textContent = "Save + Extract uses your server defaults.";
  }

  function updateButtonState(button, busyText) {
    savePageButton.disabled = state.busy || !state.serverReachable;
    saveExtractButton.disabled = state.busy || !state.serverReachable || !state.llmConfigured;
    saveTwitterButton.disabled = state.busy || !state.serverReachable || !state.isTwitterContext;
    annotateButton.disabled = state.busy;

    if (!button) {
      return;
    }

    if (!button.dataset.idleText) {
      button.dataset.idleText = button.textContent;
    }

    button.textContent = state.busy ? busyText : button.dataset.idleText;
  }

  async function runPageAction({ button, busyText, message, onSuccess }) {
    if (state.busy) {
      return;
    }

    state.busy = true;
    updateButtonState(button, busyText);
    setStatus("", "");

    const response = await sendMessage(message);

    state.busy = false;
    updateButtonState(button, busyText);

    if (response?.ok) {
      if (typeof onSuccess === "function") {
        onSuccess(response);
      } else {
        setStatus(formatSuccess(response, Boolean(message.extract)), "success");
      }
      await refreshDeckState();
      return;
    }

    setStatus(response?.error || "NomFeed action failed.", "error");
  }

  function setStatus(text, type) {
    status.textContent = text;
    status.className = type ? `status ${type}` : "status";
  }

  function updatePageMeta() {
    pageName.textContent = document.title || "Untitled page";
    pageUrl.textContent = location.href;
  }

  function updateContextState() {
    state.isTwitterContext = isTwitterUrl(location.href);
    saveTwitterButton.hidden = !state.isTwitterContext;
    twitterSection.hidden = !state.isTwitterContext;

    if (state.isTwitterContext) {
      launcherSubtitle.textContent = "save this tweet or page";
      panelSubtitle.textContent = "Capture the page or save Twitter/X context without leaving the current tab.";
      twitterMeta.textContent = describeTwitterContext(location.href);
    } else {
      launcherSubtitle.textContent = "save or annotate this page";
      panelSubtitle.textContent = "Capture this page without leaving the current tab.";
      twitterMeta.textContent = "Twitter artifact capture is available on this page.";
    }
  }

  function formatSuccess(response, extracted) {
    const id = response?.data?.id || response?.data?.item?.id || "ok";

    if (response?.data?.artifact) {
      return `Saved Twitter artifact on ${id}.`;
    }

    if (response?.data?.extracting || extracted) {
      return `Saved. Extraction queued for ${id}.`;
    }

    return `Saved page (${id}).`;
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
      return `Ready to save tweet ${tweetId} from @${handle} as a NomFeed Twitter artifact.`;
    }

    if (handle) {
      return `Ready to save Twitter/X context for @${handle}.`;
    }

    return "Ready to save this Twitter/X page as an additive NomFeed artifact.";
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response || { ok: false, error: "No response from background" });
      });
    });
  }
})();
