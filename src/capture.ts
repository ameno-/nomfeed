export type CaptureMode = "basic" | "debug";
export type CaptureStatus = "open" | "resolved" | "archived";
export type CaptureIssueType = "visual" | "functional" | "accessibility" | "performance" | "other";
export type CaptureIssueSeverity = "low" | "medium" | "high" | "critical";

export interface CaptureSize {
  width: number;
  height: number;
}

export interface CaptureEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CaptureCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureViewport {
  width: number;
  height: number;
}

export interface CaptureBoxModel {
  total: CaptureSize;
  content: CaptureSize;
  padding: CaptureEdges;
  border: CaptureEdges;
  margin: CaptureEdges;
}

export interface CaptureAccessibility {
  role?: string | null;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  focusable: boolean;
  disabled: boolean;
  expanded?: boolean;
  pressed?: boolean;
  checked?: boolean;
  selected?: boolean;
}

export interface CaptureParentContext {
  tagName: string;
  id?: string;
  classes: string[];
  styles: Record<string, string>;
}

export interface CaptureScreenshot {
  id: string;
  type: "element" | "full-page";
  path: string;
  elementIndex?: number;
}

export interface CaptureIssue {
  type: CaptureIssueType;
  severity: CaptureIssueSeverity;
  description: string;
  elementIndex?: number;
  selector?: string;
  suggestion?: string;
}

export interface CaptureElementInput {
  index?: number;
  selector: string;
  xpath?: string;
  id?: string | null;
  classes?: string[];
  tag?: string;
  tagName?: string;
  text?: string;
  attributes?: Record<string, string>;
  rect?: Partial<CaptureCoordinates>;
  coordinates?: Partial<CaptureCoordinates>;
  boxModel?: Partial<CaptureBoxModel>;
  keyStyles?: Record<string, string>;
  computedStyles?: Record<string, string>;
  cssVariables?: Record<string, string>;
  parentContext?: {
    tag?: string;
    tagName?: string;
    id?: string;
    classes?: string[];
    styles?: Record<string, string>;
  };
  accessibility?: Partial<CaptureAccessibility>;
  comment?: string;
  screenshotPath?: string;
}

export interface CaptureElement {
  index: number;
  selector: string;
  xpath?: string;
  id?: string;
  classes?: string[];
  tagName: string;
  text?: string;
  attributes: Record<string, string>;
  coordinates: CaptureCoordinates;
  boxModel: CaptureBoxModel;
  keyStyles?: Record<string, string>;
  computedStyles?: Record<string, string>;
  cssVariables?: Record<string, string>;
  parentContext?: CaptureParentContext;
  accessibility: CaptureAccessibility;
  comment: string;
  screenshotPath?: string;
}

export interface SaveCaptureInput {
  url?: string;
  title?: string;
  context?: string;
  mode?: CaptureMode;
  viewport?: Partial<CaptureViewport>;
  status?: CaptureStatus;
  tags?: string[];
  elements: CaptureElementInput[];
  screenshots?: string[];
  fullPageScreenshot?: string;
}

export interface CaptureBundle {
  id: string;
  itemId: string;
  timestamp: string;
  url: string;
  title: string;
  context?: string;
  mode: CaptureMode;
  viewport: CaptureViewport;
  elements: CaptureElement[];
  screenshots: CaptureScreenshot[];
  summary: string;
  issues: CaptureIssue[];
  recommendations: string[];
  status: CaptureStatus;
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringRecord(value?: Record<string, unknown>): Record<string, string> | undefined {
  if (!value) return undefined;
  const entries = Object.entries(value)
    .filter(([, entry]) => entry !== undefined && entry !== null)
    .map(([key, entry]) => [key, String(entry)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function normalizeCoordinates(value?: Partial<CaptureCoordinates>): CaptureCoordinates {
  return {
    x: toNumber(value?.x),
    y: toNumber(value?.y),
    width: toNumber(value?.width),
    height: toNumber(value?.height),
  };
}

function normalizeEdges(value?: Partial<CaptureEdges>): CaptureEdges {
  return {
    top: toNumber(value?.top),
    right: toNumber(value?.right),
    bottom: toNumber(value?.bottom),
    left: toNumber(value?.left),
  };
}

function normalizeBoxModel(value: Partial<CaptureBoxModel> | undefined, coordinates: CaptureCoordinates): CaptureBoxModel {
  const total = {
    width: toNumber(value?.total?.width, coordinates.width),
    height: toNumber(value?.total?.height, coordinates.height),
  };
  return {
    total,
    content: {
      width: toNumber(value?.content?.width, total.width),
      height: toNumber(value?.content?.height, total.height),
    },
    padding: normalizeEdges(value?.padding),
    border: normalizeEdges(value?.border),
    margin: normalizeEdges(value?.margin),
  };
}

function normalizeAccessibility(value?: Partial<CaptureAccessibility>): CaptureAccessibility {
  return {
    role: typeof value?.role === "string" ? value.role : null,
    name: typeof value?.name === "string" ? value.name : null,
    label: typeof value?.label === "string" ? value.label : null,
    description: typeof value?.description === "string" ? value.description : null,
    focusable: Boolean(value?.focusable),
    disabled: Boolean(value?.disabled),
    ...(value?.expanded !== undefined ? { expanded: Boolean(value.expanded) } : {}),
    ...(value?.pressed !== undefined ? { pressed: Boolean(value.pressed) } : {}),
    ...(value?.checked !== undefined ? { checked: Boolean(value.checked) } : {}),
    ...(value?.selected !== undefined ? { selected: Boolean(value.selected) } : {}),
  };
}

function normalizeParentContext(value?: CaptureElementInput["parentContext"]): CaptureParentContext | undefined {
  if (!value) return undefined;
  return {
    tagName: value.tagName || value.tag || "unknown",
    ...(value.id ? { id: value.id } : {}),
    classes: value.classes?.filter(Boolean) || [],
    styles: toStringRecord(value.styles) || {},
  };
}

export function normalizeViewport(viewport?: Partial<CaptureViewport>): CaptureViewport {
  return {
    width: toNumber(viewport?.width),
    height: toNumber(viewport?.height),
  };
}

export function normalizeCaptureElement(input: CaptureElementInput, fallbackIndex: number): CaptureElement {
  const coordinates = normalizeCoordinates(input.coordinates || input.rect);
  const parentContext = normalizeParentContext(input.parentContext);
  const keyStyles = toStringRecord(input.keyStyles);
  const computedStyles = toStringRecord(input.computedStyles);
  const cssVariables = toStringRecord(input.cssVariables);

  return {
    index: input.index && input.index > 0 ? Math.floor(input.index) : fallbackIndex,
    selector: input.selector,
    ...(input.xpath ? { xpath: input.xpath } : {}),
    ...(input.id ? { id: input.id } : {}),
    ...(input.classes?.length ? { classes: input.classes.filter(Boolean) } : {}),
    tagName: input.tagName || input.tag || "unknown",
    ...(input.text ? { text: input.text } : {}),
    attributes: toStringRecord(input.attributes) || {},
    coordinates,
    boxModel: normalizeBoxModel(input.boxModel, coordinates),
    ...(keyStyles ? { keyStyles } : {}),
    ...(computedStyles ? { computedStyles } : {}),
    ...(cssVariables ? { cssVariables } : {}),
    ...(parentContext ? { parentContext } : {}),
    accessibility: normalizeAccessibility(input.accessibility),
    comment: input.comment?.trim() || "",
    ...(input.screenshotPath ? { screenshotPath: input.screenshotPath } : {}),
  };
}

function inferIssueType(text: string): CaptureIssueType {
  if (/\baccessibility|a11y|keyboard|focus|aria|screen reader\b/.test(text)) return "accessibility";
  if (/\bslow|lag|jank|performance|render\b/.test(text)) return "performance";
  if (/\bclick|submit|validation|hidden|broken|doesn't work|does not work\b/.test(text)) return "functional";
  if (/\bcolor|spacing|padding|layout|font|contrast|visual|style\b/.test(text)) return "visual";
  return "other";
}

function inferSeverity(text: string): CaptureIssueSeverity {
  if (/\bcritical|blocker|can't|cannot|broken\b/.test(text)) return "critical";
  if (/\bregression|urgent|severe\b/.test(text)) return "high";
  if (/\bminor|nit|polish\b/.test(text)) return "low";
  return "medium";
}

export function analyzeCapture(input: {
  title: string;
  url: string;
  mode: CaptureMode;
  elements: CaptureElement[];
  screenshots: CaptureScreenshot[];
}): Pick<CaptureBundle, "summary" | "issues" | "recommendations"> {
  const issues: CaptureIssue[] = [];
  const recommendations = new Set<string>();

  for (const element of input.elements) {
    const comment = element.comment.trim();
    if (comment) {
      issues.push({
        type: inferIssueType(comment.toLowerCase()),
        severity: inferSeverity(comment.toLowerCase()),
        description: comment,
        elementIndex: element.index,
        selector: element.selector,
      });
    }

    const tag = element.tagName.toLowerCase();
    const interactive = ["a", "button", "input", "select", "textarea"].includes(tag) || element.accessibility.focusable;
    const named = Boolean(element.accessibility.name || element.accessibility.label || element.text);
    if (interactive && !named) {
      issues.push({
        type: "accessibility",
        severity: "high",
        description: `Interactive element is missing an accessible name (${element.selector})`,
        elementIndex: element.index,
        selector: element.selector,
        suggestion: "Add text content, aria-label, or aria-labelledby.",
      });
      recommendations.add("Add accessible names to interactive controls.");
    }
  }

  if (!input.screenshots.length) recommendations.add("Capture at least one screenshot for visual verification.");
  if (input.mode === "basic") recommendations.add("Use debug mode when computed styles or parent layout context matter.");

  return {
    summary: `${input.elements.length} annotated element(s) on ${input.title || input.url} in ${input.mode} mode. ${issues.length} issue(s) surfaced.`,
    issues,
    recommendations: [...recommendations],
  };
}

export function searchableCaptureText(capture: CaptureBundle): string {
  const parts = [
    capture.title,
    capture.url,
    capture.context || "",
    capture.summary,
    ...capture.issues.map((issue) => `${issue.type} ${issue.description} ${issue.selector || ""}`),
    ...capture.elements.map((element) => [
      element.selector,
      element.tagName,
      element.text || "",
      element.comment,
    ].join(" ")),
  ];

  return parts.join("\n");
}
