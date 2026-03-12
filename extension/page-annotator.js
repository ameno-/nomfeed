(function initNomFeedAnnotator() {
  if (window.__nomfeedAnnotatorInstalled) {
    return;
  }

  window.__nomfeedAnnotatorInstalled = true;

  const UI_ATTR = "data-nomfeed-annotator";
  const KEY_STYLES = [
    "display",
    "position",
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "line-height",
    "border",
    "border-radius",
    "margin",
    "padding",
    "opacity",
    "z-index",
  ];
  const DEBUG_STYLES = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "width",
    "height",
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "line-height",
    "text-align",
    "box-shadow",
    "border",
    "border-radius",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "opacity",
    "overflow",
    "visibility",
    "z-index",
  ];

  let active = false;
  let root = null;
  let highlight = null;
  let tray = null;
  let selected = [];
  let dragOffset = { x: 0, y: 0 };

  const style = document.createElement("style");
  style.setAttribute(UI_ATTR, "true");
  style.textContent = `
    .nomfeed-annotator-root {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      pointer-events: none;
      font-family: "Avenir Next", "SF Pro Rounded", "Segoe UI", sans-serif;
      color: hsl(40 6% 16%);
    }
    .nomfeed-annotator-root * { box-sizing: border-box; }
    .nomfeed-highlight {
      position: fixed;
      border: 2px solid hsl(24 78% 47%);
      background: hsl(24 78% 47% / 0.12);
      box-shadow: 0 0 0 1px hsl(0 0% 100% / 0.75);
      border-radius: 10px;
      display: none;
      pointer-events: none;
    }
    .nomfeed-tray {
      position: fixed;
      top: 18px;
      right: 18px;
      width: min(340px, calc(100vw - 24px));
      max-height: calc(100vh - 36px);
      overflow: auto;
      pointer-events: auto;
      padding: 12px;
      border-radius: 18px;
      border: 1px solid hsl(35 18% 82%);
      background: linear-gradient(160deg, hsl(44 34% 97%) 0%, hsl(40 22% 92%) 100%);
      box-shadow: 0 24px 60px hsl(40 6% 16% / 0.18);
    }
    .nomfeed-tray-head {
      margin-bottom: 10px;
      cursor: move;
    }
    .nomfeed-tray-head h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .nomfeed-tray-head p {
      margin: 4px 0 0;
      font-size: 12px;
      color: hsl(40 8% 45%);
      line-height: 1.45;
    }
    .nomfeed-field {
      margin-bottom: 10px;
      pointer-events: auto;
    }
    .nomfeed-field label {
      display: block;
      margin-bottom: 4px;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: hsl(40 8% 45%);
    }
    .nomfeed-field textarea,
    .nomfeed-field select {
      width: 100%;
      border-radius: 12px;
      border: 1px solid hsl(35 16% 82%);
      background: hsl(0 0% 100% / 0.82);
      padding: 9px 10px;
      font: inherit;
      color: hsl(40 6% 16%);
    }
    .nomfeed-field textarea {
      min-height: 72px;
      resize: vertical;
    }
    .nomfeed-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .nomfeed-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: 1px solid hsl(35 16% 84%);
      border-radius: 12px;
      background: hsl(40 22% 94%);
      margin-bottom: 10px;
      pointer-events: auto;
    }
    .nomfeed-toggle input { accent-color: hsl(24 78% 47%); }
    .nomfeed-count {
      margin-bottom: 10px;
      font-size: 11px;
      color: hsl(40 8% 45%);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .nomfeed-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 10px 0;
    }
    .nomfeed-empty {
      padding: 10px;
      border-radius: 12px;
      border: 1px dashed hsl(35 16% 84%);
      background: hsl(40 22% 94%);
      color: hsl(40 8% 45%);
      font-size: 12px;
    }
    .nomfeed-card {
      padding: 10px;
      border-radius: 14px;
      border: 1px solid hsl(35 16% 84%);
      background: hsl(0 0% 100% / 0.75);
      pointer-events: auto;
    }
    .nomfeed-card-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .nomfeed-selector {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: hsl(24 78% 40%);
      word-break: break-word;
    }
    .nomfeed-snippet {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.4;
      color: hsl(40 8% 45%);
    }
    .nomfeed-remove {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      border: 1px solid hsl(35 16% 82%);
      background: hsl(40 22% 94%);
      color: hsl(40 6% 24%);
      cursor: pointer;
    }
    .nomfeed-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      pointer-events: auto;
    }
    .nomfeed-actions button {
      flex: 1;
      border: none;
      border-radius: 12px;
      padding: 10px 12px;
      font: inherit;
      cursor: pointer;
    }
    .nomfeed-primary {
      background: linear-gradient(135deg, hsl(24 78% 47%), hsl(18 74% 41%));
      color: white;
    }
    .nomfeed-secondary {
      background: hsl(40 22% 94%);
      color: hsl(40 6% 24%);
      border: 1px solid hsl(35 16% 84%);
    }
    .nomfeed-status {
      min-height: 18px;
      margin-top: 10px;
      font-size: 12px;
      line-height: 1.4;
      color: hsl(40 8% 45%);
      pointer-events: auto;
    }
    .nomfeed-status.error { color: hsl(0 48% 45%); }
    .nomfeed-status.success { color: hsl(100 20% 35%); }
    .nomfeed-badge {
      position: fixed;
      min-width: 24px;
      height: 24px;
      border-radius: 999px;
      background: hsl(24 78% 47%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      pointer-events: none;
      box-shadow: 0 10px 20px hsl(24 78% 47% / 0.3);
    }
  `;

  function isUi(node) {
    return Boolean(node?.closest?.(`[${UI_ATTR}]`));
  }

  function startAnnotation() {
    if (active) return;
    active = true;
    selected = [];
    root = document.createElement("div");
    root.className = "nomfeed-annotator-root";
    root.setAttribute(UI_ATTR, "true");
    root.innerHTML = `
      <div class="nomfeed-highlight" ${UI_ATTR}="true"></div>
      <div class="nomfeed-tray" ${UI_ATTR}="true">
        <div class="nomfeed-tray-head" ${UI_ATTR}="true">
          <h2>Annotate Page</h2>
          <p>Click elements to add them. Esc cancels. Keep targets visible for accurate screenshots.</p>
        </div>
        <div class="nomfeed-field">
          <label>Context</label>
          <textarea class="nomfeed-context" placeholder="What are you trying to capture?"></textarea>
        </div>
        <div class="nomfeed-row">
          <div class="nomfeed-field">
            <label>Screenshots</label>
            <select class="nomfeed-screenshots">
              <option value="full">Full page</option>
              <option value="element">Per element</option>
              <option value="none">None</option>
            </select>
          </div>
          <div class="nomfeed-field">
            <label>Mode</label>
            <select class="nomfeed-mode">
              <option value="basic">Basic</option>
              <option value="debug">Debug</option>
            </select>
          </div>
        </div>
        <label class="nomfeed-toggle">
          <input type="checkbox" class="nomfeed-debug">
          <span>Capture debug metadata</span>
        </label>
        <div class="nomfeed-count">0 selected</div>
        <div class="nomfeed-list"></div>
        <div class="nomfeed-actions">
          <button class="nomfeed-secondary" type="button">Cancel</button>
          <button class="nomfeed-primary" type="button">Save Capture</button>
        </div>
        <div class="nomfeed-status"></div>
      </div>
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(root);

    highlight = root.querySelector(".nomfeed-highlight");
    tray = root.querySelector(".nomfeed-tray");
    tray.querySelector(".nomfeed-tray-head").addEventListener("mousedown", startDragTray);
    tray.querySelector(".nomfeed-secondary").addEventListener("click", stopAnnotation);
    tray.querySelector(".nomfeed-primary").addEventListener("click", submitCapture);

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", renderBadges, true);
    window.addEventListener("resize", renderBadges);
    renderSelectionList();
  }

  function stopAnnotation() {
    active = false;
    selected = [];
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", renderBadges, true);
    window.removeEventListener("resize", renderBadges);
    clearBadges();
    root?.remove();
    root = null;
    highlight = null;
    tray = null;
    style.remove();
  }

  function setStatus(text, kind = "") {
    if (!tray) return;
    const status = tray.querySelector(".nomfeed-status");
    status.textContent = text;
    status.className = kind ? `nomfeed-status ${kind}` : "nomfeed-status";
  }

  function onMouseMove(event) {
    if (!active || !highlight) return;
    const target = event.target;
    if (!(target instanceof Element) || isUi(target)) {
      highlight.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.left = `${rect.left}px`;
    highlight.style.top = `${rect.top}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
  }

  function onClick(event) {
    if (!active) return;
    const target = event.target;
    if (!(target instanceof Element) || isUi(target)) return;
    event.preventDefault();
    event.stopPropagation();

    if (selected.some((entry) => entry.element === target)) {
      setStatus("Element already selected.");
      return;
    }

    selected.push({ element: target, comment: "" });
    renderSelectionList();
    renderBadges();
  }

  function onKeyDown(event) {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      stopAnnotation();
    }
  }

  function startDragTray(event) {
    const rect = tray.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };

    const onMove = (moveEvent) => {
      tray.style.left = `${Math.max(8, moveEvent.clientX - dragOffset.x)}px`;
      tray.style.top = `${Math.max(8, moveEvent.clientY - dragOffset.y)}px`;
      tray.style.right = "auto";
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  }

  function clearBadges() {
    document.querySelectorAll(".nomfeed-badge").forEach((node) => node.remove());
  }

  function renderBadges() {
    clearBadges();
    selected.forEach((entry, index) => {
      const rect = entry.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const badge = document.createElement("div");
      badge.className = "nomfeed-badge";
      badge.setAttribute(UI_ATTR, "true");
      badge.textContent = String(index + 1);
      badge.style.left = `${Math.max(8, rect.left - 8)}px`;
      badge.style.top = `${Math.max(8, rect.top - 8)}px`;
      document.documentElement.appendChild(badge);
    });
  }

  function uniqueSelector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
      let part = current.tagName.toLowerCase();
      if (current.classList.length) {
        part += "." + Array.from(current.classList).slice(0, 2).map((name) => CSS.escape(name)).join(".");
      }
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter((node) => node.tagName === current.tagName)
        : [];
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      const selector = parts.join(" > ");
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {}
      current = current.parentElement;
    }
    return parts.join(" > ") || element.tagName.toLowerCase();
  }

  function truncate(text, max = 100) {
    const value = (text || "").replace(/\s+/g, " ").trim();
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function escapeHtml(text) {
    return (text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSelectionList() {
    if (!tray) return;
    const list = tray.querySelector(".nomfeed-list");
    const count = tray.querySelector(".nomfeed-count");
    count.textContent = `${selected.length} selected`;

    if (!selected.length) {
      list.innerHTML = `<div class="nomfeed-empty">No elements yet. Click the page to add one.</div>`;
      return;
    }

    list.innerHTML = selected.map((entry, index) => `
      <div class="nomfeed-card">
        <div class="nomfeed-card-top">
          <div>
            <div class="nomfeed-selector">${escapeHtml(uniqueSelector(entry.element))}</div>
            <div class="nomfeed-snippet">${escapeHtml(truncate(entry.element.innerText || entry.element.textContent || entry.element.tagName, 90))}</div>
          </div>
          <button class="nomfeed-remove" type="button" data-remove="${index}">×</button>
        </div>
        <div class="nomfeed-field">
          <label>Comment</label>
          <textarea data-comment="${index}" placeholder="What should change?">${escapeHtml(entry.comment)}</textarea>
        </div>
      </div>
    `).join("");

    list.querySelectorAll("textarea[data-comment]").forEach((textarea) => {
      textarea.addEventListener("input", (event) => {
        selected[Number(event.currentTarget.dataset.comment)].comment = event.currentTarget.value;
      });
    });

    list.querySelectorAll("button[data-remove]").forEach((button) => {
      button.addEventListener("click", (event) => {
        selected.splice(Number(event.currentTarget.dataset.remove), 1);
        renderSelectionList();
        renderBadges();
      });
    });
  }

  function getStyleSubset(styles, properties) {
    return Object.fromEntries(
      properties
        .map((property) => [property, styles.getPropertyValue(property).trim()])
        .filter(([, value]) => value)
    );
  }

  function getCssVariables(styles) {
    const values = {};
    for (const property of Array.from(styles)) {
      if (!property.startsWith("--")) continue;
      const value = styles.getPropertyValue(property).trim();
      if (value) values[property] = value;
    }
    return values;
  }

  function getAccessibility(element) {
    const label = element.getAttribute("aria-label");
    const descriptionId = element.getAttribute("aria-describedby");
    return {
      role: element.getAttribute("role"),
      label,
      name: label || element.innerText?.trim() || element.getAttribute("alt") || null,
      description: descriptionId ? document.getElementById(descriptionId)?.innerText?.trim() || null : null,
      focusable: /^(a|button|input|select|textarea)$/.test(element.tagName.toLowerCase()) || element.hasAttribute("tabindex"),
      disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
    };
  }

  function computeBoxModel(element, rect, styles) {
    const padding = {
      top: parseFloat(styles.paddingTop) || 0,
      right: parseFloat(styles.paddingRight) || 0,
      bottom: parseFloat(styles.paddingBottom) || 0,
      left: parseFloat(styles.paddingLeft) || 0,
    };
    const border = {
      top: parseFloat(styles.borderTopWidth) || 0,
      right: parseFloat(styles.borderRightWidth) || 0,
      bottom: parseFloat(styles.borderBottomWidth) || 0,
      left: parseFloat(styles.borderLeftWidth) || 0,
    };
    const margin = {
      top: parseFloat(styles.marginTop) || 0,
      right: parseFloat(styles.marginRight) || 0,
      bottom: parseFloat(styles.marginBottom) || 0,
      left: parseFloat(styles.marginLeft) || 0,
    };
    return {
      total: { width: rect.width, height: rect.height },
      content: {
        width: Math.max(0, rect.width - padding.left - padding.right - border.left - border.right),
        height: Math.max(0, rect.height - padding.top - padding.bottom - border.top - border.bottom),
      },
      padding,
      border,
      margin,
    };
  }

  function serializeElement(entry, index, debug) {
    const element = entry.element;
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return {
      index: index + 1,
      selector: uniqueSelector(element),
      ...(element.id ? { id: element.id } : {}),
      ...(element.classList.length ? { classes: Array.from(element.classList) } : {}),
      tagName: element.tagName.toLowerCase(),
      text: truncate(element.innerText || element.textContent || ""),
      attributes: Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value])),
      coordinates: {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      },
      boxModel: computeBoxModel(element, rect, styles),
      keyStyles: getStyleSubset(styles, KEY_STYLES),
      accessibility: getAccessibility(element),
      comment: entry.comment,
      ...(debug ? {
        computedStyles: getStyleSubset(styles, DEBUG_STYLES),
        cssVariables: getCssVariables(styles),
        parentContext: element.parentElement ? {
          tagName: element.parentElement.tagName.toLowerCase(),
          ...(element.parentElement.id ? { id: element.parentElement.id } : {}),
          classes: Array.from(element.parentElement.classList),
          styles: getStyleSubset(window.getComputedStyle(element.parentElement), ["display", "position", "gap", "justify-content", "align-items", "overflow"]),
        } : undefined,
      } : {}),
    };
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  async function cropElementScreenshot(fullDataUrl, element) {
    const image = await loadImage(fullDataUrl);
    const rect = element.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const left = Math.max(0, Math.floor(rect.left * scale));
    const top = Math.max(0, Math.floor(rect.top * scale));
    const width = Math.max(1, Math.min(image.width - left, Math.ceil(rect.width * scale)));
    const height = Math.max(1, Math.min(image.height - top, Math.ceil(rect.height * scale)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, left, top, width, height, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  }

  async function collectScreenshots(mode) {
    if (mode === "none") return { screenshots: [], fullPageScreenshot: undefined };
    const response = await sendMessage({ type: "nomfeed:capture-visible-tab" });
    if (!response?.ok || !response.dataUrl) {
      throw new Error(response?.error || "Screenshot capture failed.");
    }
    if (mode === "full") return { screenshots: [], fullPageScreenshot: response.dataUrl };

    const screenshots = [];
    for (const entry of selected) {
      screenshots.push(await cropElementScreenshot(response.dataUrl, entry.element));
    }
    return { screenshots, fullPageScreenshot: undefined };
  }

  async function submitCapture() {
    if (!selected.length) {
      setStatus("Pick at least one element first.", "error");
      return;
    }

    const submit = tray.querySelector(".nomfeed-primary");
    const context = tray.querySelector(".nomfeed-context").value.trim();
    const screenshotMode = tray.querySelector(".nomfeed-screenshots").value;
    const mode = tray.querySelector(".nomfeed-debug").checked ? "debug" : tray.querySelector(".nomfeed-mode").value;

    submit.disabled = true;
    setStatus("Saving capture...");

    try {
      const { screenshots, fullPageScreenshot } = await collectScreenshots(screenshotMode);
      const response = await sendMessage({
        type: "nomfeed:save-capture",
        title: document.title,
        payload: {
          context,
          mode,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          elements: selected.map((entry, index) => serializeElement(entry, index, mode === "debug")),
          screenshots,
          ...(fullPageScreenshot ? { fullPageScreenshot } : {}),
        },
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Capture save failed.");
      }

      setStatus(`Capture saved on ${response.data.item.id}.`, "success");
      setTimeout(() => stopAnnotation(), 700);
    } catch (error) {
      setStatus(String(error), "error");
    } finally {
      submit.disabled = false;
    }
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

  window.addEventListener("nomfeed:start-annotation", startAnnotation);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "nomfeed:start-annotation") {
      return false;
    }
    startAnnotation();
    sendResponse({ ok: true });
    return true;
  });
})();
