# Implementation Plan: `firefly_dom_inspect` Tool

## Overview

Build a comprehensive, read-only DOM inspection tool for debugging Adobe Firefly browser automation. This tool will be the primary debugging utility for diagnosing broken Playwright automation when Adobe changes the UI.

---

## Architecture

### File Structure

```
src/
  utils/
    ringBuffer.ts              # Generic RingBuffer<T> class (60-80 lines)
  browser.ts                   # Add console/network buffers + listener setup
  firefly/
    domInspect.ts              # Main orchestrator (400-500 lines)
    domWatch.ts                # MutationObserver watch mode (200-250 lines)
    dom/
      pageInfo.ts              # Page metadata + framework detection (100-120 lines)
      selectorDiscovery.ts     # Element discovery + locator suggestions (300-350 lines)
      shadowDom.ts             # Shadow DOM traversal with maxDepth (120-140 lines)
      accessibility.ts         # Accessibility tree + computed names (80-100 lines)
      iframes.ts               # Iframe inspection (80-100 lines)
      dialogs.ts               # Dialog/modal detection (60-80 lines)
      forms.ts                 # Form inspection (80-100 lines)
      performance.ts           # Modern Performance API (80-100 lines)
      locatorGen.ts            # Locator suggestion generator (200-250 lines)
      tree.ts                  # DOM tree mode (100-120 lines)
      artifacts.ts             # Screenshots + HTML + ZIP export (150-180 lines)
  tools/
    domInspect.ts              # MCP tool registration (150-180 lines)
    domWatch.ts                # MCP watch tool registration (80-100 lines)
tests/
  domInspect.test.ts           # Smoke tests (200-250 lines)
```

### Module Responsibilities

---

## Core Infrastructure

### `src/utils/ringBuffer.ts`

Generic ring buffer for console/network capture:

```typescript
class RingBuffer<T> {
  constructor(private readonly capacity: number) {}
  add(item: T): void;
  toArray(limit?: number): T[];
  clear(): void;
  get size(): number;
}
```

Fixed-size circular buffer. When full, oldest entries are overwritten. No memory leaks.

### `src/browser.ts` (Modified)

Add to `BrowserManager`:

```typescript
class BrowserManager {
  private consoleBuffer = new RingBuffer<ConsoleEntry>(500);
  private networkBuffer = new RingBuffer<NetworkEntry>(500);
  private listenersInstalled = new WeakSet<Page>();

  ensureListeners(page: Page): void {
    if (this.listenersInstalled.has(page)) return;

    page.on("console", (msg) => {
      this.consoleBuffer.add({
        timestamp: new Date().toISOString(),
        type: msg.type(),
        text: msg.text(),
      });
    });

    page.on("request", (req) => {
      this.networkBuffer.add({
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
        startTime: Date.now(),
      });
    });

    page.on("response", (res) => {
      // Find matching request and update with status + duration
    });

    page.on("requestfailed", (req) => {
      // Mark as failed
    });

    this.listenersInstalled.add(page);
  }

  getConsoleMessages(limit?: number): ConsoleEntry[];
  getNetworkRequests(limit?: number): NetworkEntry[];
  clearBuffers(): void;
}
```

**Key**: Listeners are installed once per page, stored in MCP process memory (not page JS context). Survives navigation, reloads, CSP issues, and Adobe script interference.

---

## Inspection Modes

### Mode 1: `full` (Default)

Returns everything:

- Page info
- Selector discovery
- Shadow DOM
- Accessibility
- Iframes
- Dialogs
- Forms
- Console
- Network
- Performance
- DOM tree
- Framework detection

### Mode 2: `selector`

Input: `selector: "[data-testid='generate-button']"`

Returns:

- Full DOM subtree of matching element(s)
- Computed accessibility info
- Shadow DOM beneath it
- Matching Playwright locator suggestions
- Element screenshot
- Element outerHTML

### Mode 3: `shadow`

Input: `maxDepth: 8` (optional, default 8)

Recursively traverses ALL open shadow roots up to maxDepth. Returns:

- Host tag, id, classes
- Children count
- Nested shadow roots (recursive, depth-limited)
- First 5000 chars of shadow HTML
- Handles Adobe Spectrum components (sp-_, spectrum-_)

### Mode 4: `accessibility`

Returns only:

- Playwright accessibility tree snapshot
- Computed accessible names for all interactive elements
- Explicitly returns null if unavailable

### Mode 5: `tree` (NEW)

Input: `maxDepth: 10` (optional, default 10)

Returns visual DOM tree:

```
body
 ├── div[data-testid="app"]
 │    ├── sp-button[data-testid="generate-button"]
 │    │    └── "Generate"
 │    ├── textarea[aria-label="Prompt"]
 │    └── div.sidebar
 │         ├── sp-action-button
 │         └── sp-action-button
```

With depth limit to prevent explosion on complex pages.

### Mode 6: `watch` (NEW - Separate Tool: `firefly_dom_watch`)

Input:

```typescript
{
  timeoutMs: 60000,        // Watch duration
  targetSelector?: string, // Optional: only watch this subtree
  mutations?: string[],    // Filter: ["childList", "attributes", "characterData"]
}
```

Uses MutationObserver to report DOM changes in real-time:

```json
{
  "mutations": [
    {
      "time": "12:34:56.789",
      "type": "childList",
      "action": "added",
      "selector": "sp-button[data-testid='generate-button']"
    },
    {
      "time": "12:34:57.123",
      "type": "attributes",
      "attribute": "disabled",
      "selector": "sp-button[data-testid='generate-button']"
    },
    {
      "time": "12:34:58.456",
      "type": "childList",
      "action": "removed",
      "selector": "div.spinner"
    }
  ]
}
```

**Killer feature**: Know exactly when buttons appear, spinners disappear, toasts show.

---

## General Page Information

Always return:

```typescript
{
  timestamp: string;        // ISO 8601
  url: string;
  title: string;
  browserVersion: string;   // From context.browser().version()
  viewport: { width: number; height: number };
  readyState: string;       // document.readyState
  language: string;         // document.documentElement.lang
  userAgent: string;

  // NEW: Framework detection
  frameworks: {
    react?: string;         // React version if detected
    vue?: string;
    angular?: string;
    lit?: string;
    shadowRootCount: number;
  };
}
```

### Framework Detection

```typescript
// React
window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size > 0;
document.querySelector("[data-reactroot]") !== null;

// Vue
window.__VUE__ !== undefined;
document.querySelector("[data-v-]") !== null;

// Angular
window.ng !== undefined;
document.querySelector("[ng-version]") !== null;

// Lit
customElements.get("lit-html") !== undefined;
```

---

## Selector Discovery

Collect every visible element matching:

```
[data-testid]
button
[role="button"]
sp-button
sp-action-button
textarea
input
select
option
label
fieldset
form
dialog
[contenteditable="true"]
```

For every element return:

- tag, id, class, role, data-testid
- aria-label, aria-labelledby, aria-describedby
- placeholder, name, type, disabled, readonly
- visible (computed), enabled
- text content (trimmed)
- bounding box (from getBoundingClientRect)
- computed styles: display, visibility, pointer-events
- outerHTML (first 3000 chars)

### NEW: Selector Uniqueness

For every generated selector, include:

```typescript
{
  selector: string;
  uniqueness: {
    matches: number; // How many elements this selector matches
    isUnique: boolean; // matches === 1
  }
}
```

If a selector matches 14 buttons, it's not very useful. This helps identify the best selectors.

---

## Playwright Locator Suggestions

For every discovered element generate preferred Playwright locators:

### Locator Types (per element)

```typescript
{
  playwright: string; // page.getByTestId(...), page.getByRole(...), etc.
  css: string; // [data-testid="..."], button, etc.
  xpath: string; // //button[@data-testid="..."]
  stability: "high" | "medium" | "low";
  reason: string; // Why this stability rating
  matches: number; // How many elements this matches
}
```

### Ranking (Most to Least Stable)

1. **High Stability**:
   - `page.getByTestId(testid)` — if data-testid exists
   - `page.getByLabel(label)` — if associated label exists
   - `page.locator('[aria-label="..."]')` — if aria-label exists

2. **Medium Stability**:
   - `page.getByRole(role, { name })` — if role + accessible name
   - `page.getByPlaceholder(placeholder)` — if placeholder exists
   - `page.getByText(text)` — if unique text exists

3. **Low Stability**:
   - `page.locator('tag[attribute]')` — generic attribute selectors
   - `page.locator('tag')` — tag-only selectors

4. **Never Recommended**:
   - Hashed CSS classes: `[class^="abc123"]`
   - Generated IDs: `[id^="el-"]`

### NEW: XPath Support

Always include XPath for debugging:

```typescript
// For element: <sp-button data-testid="generate-button">
{
  xpath: "//sp-button[@data-testid='generate-button']",
  css: "[data-testid='generate-button']",
  playwright: 'page.getByTestId("generate-button")',
}
```

---

## Shadow DOM

Recursively inspect ALL open shadow roots up to `maxDepth` (default 8).

Return:

- host tag, id, classes
- children count
- nested shadow roots (recursive, depth-limited)
- first 5000 chars of shadow HTML
- depth level

### Depth Protection

```typescript
function traverseShadowRoot(
  host: Element,
  currentDepth: number,
  maxDepth: number,
): ShadowRootInfo[] {
  if (currentDepth >= maxDepth) {
    return [{ depth: currentDepth, truncated: true }];
  }
  // ... traverse
}
```

Adobe Spectrum components rely heavily on Shadow DOM. This is critical.

---

## Iframes

Return every iframe.

For each:

- URL, title, name
- same-origin status (compare hostname)
- If same-origin: inspect recursively via contentFrame()

---

## Dialogs

Return every:

- dialog, modal, popover, toast, overlay

Detection:

```typescript
'[role="dialog"]';
'[role="alertdialog"]';
'[aria-modal="true"]';
'[data-testid*="dialog"]';
'[data-testid*="modal"]';
"dialog";
"[popover]";
```

---

## Forms

Return:

- forms, fieldsets, legends, labels
- validation state (validity API)
- required fields

---

## Performance

Use **modern Performance APIs** (not deprecated `performance.timing`):

```typescript
// Navigation Timing
performance.getEntriesByType("navigation")[0];

// Paint Timing
performance.getEntriesByType("paint");

// LCP (Largest Contentful Paint)
new PerformanceObserver((list) => {
  const entries = list.getEntries();
  // Get last entry
}).observe({ type: "largest-contentful-paint", buffered: true });

// Memory (if available)
performance.memory;
```

Return:

- Navigation Timing (from `getEntriesByType("navigation")`)
- Paint Timing (FCP from `getEntriesByType("paint")`)
- Performance Memory (if available)
- Largest Contentful Paint
- First Contentful Paint
- DOM Interactive
- DOMContentLoaded
- Load event

---

## Screenshots

### Standard Screenshot

Always create:

```
debug/dom-inspect.png
```

Full-page screenshot.

### NEW: Annotated Screenshot

Also produce:

```
debug/dom-inspect-annotated.png
```

Where discovered interactive elements have numbered annotations:

```
① Generate
② Download
③ Prompt textarea
④ Aspect Ratio dropdown
```

Implementation:

1. Take full-page screenshot
2. For each discovered element with bounding box:
   - Draw numbered circle at element position
   - Add label text nearby
3. Save annotated version

Use Canvas API in `page.evaluate()` or Playwright's screenshot + annotation.

### Element Screenshots (NEW)

If `captureElementScreenshots: true`:

```
debug/elements/button_001_generate.png
debug/elements/button_002_download.png
debug/elements/textarea_003_prompt.png
```

Each discovered button/input gets its own screenshot. Fantastic for visual debugging.

### Selector Mode Screenshot

If selector mode: also save element-only screenshot:

```
debug/element.png
```

---

## HTML

Always save:

```
debug/dom.html
```

If selector mode: also save

```
debug/element.html
```

---

## Console

Capture the latest N console messages (configurable, default 200, max 500).

**Source**: `BrowserManager.consoleBuffer` (not page.evaluate())

Return for each:

- timestamp
- type (log/warn/error/info/debug)
- message text

---

## Network

Capture the latest N requests (configurable, default 200, max 500).

**Source**: `BrowserManager.networkBuffer` (not page.evaluate())

Return for each:

- URL
- method
- status
- resource type
- duration (calculated from request start to response)

---

## NEW: ZIP Export

Package all artifacts into a single ZIP:

```
debug/firefly-dom-report.zip
```

Contents:

```
dom.json           // Full structured result
dom.html           // Page HTML
screenshot.png     // Full-page screenshot
annotated.png      // Annotated screenshot
accessibility.json // Accessibility tree
network.json       // Network requests
console.json       // Console messages
selectors.json     // Discovered selectors + locators
element/           // Element screenshots (if enabled)
  button_001.png
  button_002.png
  ...
```

Now Claude can inspect **one file** instead of six.

---

## Output Structure

```typescript
interface DomInspectResult {
  ok: boolean;

  // Always present
  pageInfo: PageInfo;

  // Mode-dependent
  selectors?: DiscoveredSelector[];
  tree?: TreeNode;
  shadowDom?: ShadowRootInfo[];
  accessibility?: AccessibilitySnapshot | null;
  iframes?: IframeInfo[];
  dialogs?: DialogInfo[];
  forms?: FormInfo[];

  // Optional based on flags
  console?: ConsoleMessage[];
  network?: NetworkRequest[];
  performance?: PerformanceMetrics;

  // Artifacts
  artifacts: {
    screenshotPath?: string;
    annotatedScreenshotPath?: string;
    htmlPath?: string;
    elementHtmlPath?: string;
    elementScreenshotPaths?: string[];
    zipPath?: string;
  };

  // Warnings
  warnings: string[];
}

interface PageInfo {
  timestamp: string;
  url: string;
  title: string;
  browserVersion: string;
  viewport: { width: number; height: number };
  readyState: string;
  language: string;
  userAgent: string;
  frameworks: {
    react?: string;
    vue?: string;
    angular?: string;
    lit?: string;
    shadowRootCount: number;
  };
}

interface DiscoveredSelector {
  tag: string;
  id: string;
  classes: string;
  role: string;
  testid: string;
  ariaLabel: string;
  ariaLabelledby: string;
  ariaDescribedby: string;
  placeholder: string;
  name: string;
  type: string;
  disabled: boolean;
  readonly: boolean;
  visible: boolean;
  enabled: boolean;
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  computedStyles: { display: string; visibility: string; pointerEvents: string };
  outerHTML: string;
  locators: LocatorSuggestion[];
}

interface LocatorSuggestion {
  playwright: string;
  css: string;
  xpath: string;
  stability: "high" | "medium" | "low";
  reason: string;
  matches: number;
}

interface ShadowRootInfo {
  hostTag: string;
  hostId: string;
  hostClasses: string;
  childrenCount: number;
  depth: number;
  truncated: boolean;
  shadowHTML: string;
  nestedRoots: ShadowRootInfo[];
}

interface TreeNode {
  tag: string;
  id: string;
  classes: string;
  testid: string;
  ariaLabel: string;
  text: string;
  children: TreeNode[];
  depth: number;
}
```

---

## Input Schema

```typescript
{
  mode: z.enum(['full', 'selector', 'shadow', 'accessibility', 'tree']).default('full')
    .describe('Inspection mode'),

  selector: z.string().optional()
    .describe('CSS selector for selector mode (required when mode=selector)'),

  maxDepth: z.number().int().min(1).max(20).default(10)
    .describe('Maximum depth for tree/shadow traversal'),

  includeHtml: z.boolean().default(true)
    .describe('Save HTML snapshot to debug/dom.html'),

  includeScreenshot: z.boolean().default(true)
    .describe('Save screenshot to debug/dom-inspect.png'),

  includeAnnotatedScreenshot: z.boolean().default(true)
    .describe('Save annotated screenshot with element labels'),

  captureElementScreenshots: z.boolean().default(false)
    .describe('Save individual screenshots for each discovered element'),

  includeNetwork: z.boolean().default(true)
    .describe('Capture network requests'),

  includeConsole: z.boolean().default(true)
    .describe('Capture console messages'),

  includeAccessibility: z.boolean().default(true)
    .describe('Include accessibility tree'),

  includeZip: z.boolean().default(true)
    .describe('Package all artifacts into a ZIP file'),

  maxConsoleMessages: z.number().int().min(1).max(500).default(200)
    .describe('Maximum console messages to return'),

  maxNetworkRequests: z.number().int().min(1).max(500).default(200)
    .describe('Maximum network requests to return'),
}
```

---

## Watch Mode (`firefly_dom_watch`)

Separate tool for real-time DOM monitoring:

```typescript
{
  timeoutMs: z.number().int().min(1000).max(300000).default(60000)
    .describe('Watch duration in milliseconds'),

  targetSelector: z.string().optional()
    .describe('Optional: only watch mutations in this subtree'),

  mutations: z.array(z.enum(['childList', 'attributes', 'characterData']))
    .default(['childList', 'attributes'])
    .describe('Types of mutations to observe'),
}
```

Returns:

```typescript
{
  ok: boolean;
  pageInfo: PageInfo;
  duration: number;
  mutations: MutationEntry[];
  summary: {
    totalMutations: number;
    addedNodes: number;
    removedNodes: number;
    attributeChanges: number;
  };
}

interface MutationEntry {
  timestamp: string;
  type: 'childList' | 'attributes' | 'characterData';
  action: 'added' | 'removed' | 'attributeChanged';
  targetSelector: string;
  attributeName?: string;
  oldValue?: string;
  addedNodes: string[];
  removedNodes: string[];
}
```

---

## Implementation Steps

### Phase 1: Core Infrastructure (Files 1-4)

1. **Create `src/utils/ringBuffer.ts`**
   - Implement generic `RingBuffer<T>` class
   - `add(item)`, `toArray(limit?)`, `clear()`, `size`

2. **Modify `src/browser.ts`**
   - Add `consoleBuffer` and `networkBuffer` as `RingBuffer`
   - Add `ensureListeners(page)` method
   - Add `getConsoleMessages(limit?)` and `getNetworkRequests(limit?)` methods
   - Add `clearBuffers()` method
   - Install listeners: console, request, response, requestfailed

3. **Create `src/firefly/dom/pageInfo.ts`**
   - Implement `collectPageInfo(page, context)` function
   - Detect frameworks (React, Vue, Angular, Lit)
   - Count shadow roots

4. **Create `src/firefly/dom/locatorGen.ts`**
   - Implement `generateLocatorSuggestions(element, page)` function
   - Return playwright, css, xpath locators
   - Calculate uniqueness (matches count)
   - Rank by stability
   - Never recommend hashed CSS classes

### Phase 2: Element Discovery (Files 5-7)

5. **Create `src/firefly/dom/selectorDiscovery.ts`**
   - Implement `discoverElements(page)` function
   - Query all required element types
   - Extract comprehensive attributes
   - Compute visibility and bounding boxes
   - Generate locator suggestions with uniqueness

6. **Create `src/firefly/dom/shadowDom.ts`**
   - Implement `traverseShadowDom(page, maxDepth)` function
   - Recursively visit all shadow roots (depth-limited)
   - Extract host info, children count, nested roots
   - Capture shadow HTML (first 5000 chars)

7. **Create `src/firefly/dom/tree.ts`**
   - Implement `buildDomTree(page, maxDepth)` function
   - Build tree structure from body
   - Include testid, aria-label, text for each node

### Phase 3: Specialized Inspectors (Files 8-12)

8. **Create `src/firefly/dom/accessibility.ts`**
   - Implement `collectAccessibility(page)` function
   - Use `page.accessibility.snapshot()`
   - Compute accessible names for interactive elements

9. **Create `src/firefly/dom/iframes.ts`**
   - Implement `inspectIframes(page)` function
   - Detect all iframes
   - Check same-origin status
   - Recursively inspect same-origin iframes

10. **Create `src/firefly/dom/dialogs.ts`**
    - Implement `detectDialogs(page)` function
    - Find dialog, modal, popover, toast elements

11. **Create `src/firefly/dom/forms.ts`**
    - Implement `inspectForms(page)` function
    - Extract form structure + validation state

12. **Create `src/firefly/dom/performance.ts`**
    - Implement `collectPerformance(page)` function
    - Use modern Performance APIs (no performance.timing)
    - Navigation Timing, Paint Timing, LCP, Memory

### Phase 4: Artifacts (File 13)

13. **Create `src/firefly/dom/artifacts.ts`**
    - Implement `saveScreenshot()` — standard screenshot
    - Implement `saveAnnotatedScreenshot()` — with numbered labels
    - Implement `saveElementScreenshots()` — individual element shots
    - Implement `saveHtml()` — page HTML
    - Implement `saveZip()` — package all into ZIP
    - Use `ensureDirectory()` and `uniqueFilePath()` from existing utils

### Phase 5: Main Orchestrators (Files 14-15)

14. **Create `src/firefly/domInspect.ts`**
    - Implement `runDomInspect(browser, config, logger, input)` function
    - Route to appropriate sub-modules based on mode
    - Aggregate results
    - Handle errors gracefully
    - Return structured JSON

15. **Create `src/firefly/domWatch.ts`**
    - Implement `runDomWatch(browser, config, logger, input)` function
    - Set up MutationObserver
    - Collect mutations over timeout
    - Return mutation log + summary

### Phase 6: Tool Registration (Files 16-17)

16. **Create `src/tools/domInspect.ts`**
    - Register `firefly_dom_inspect` tool
    - Define Zod input schema
    - Call `runDomInspect()` in tool handler

17. **Create `src/tools/domWatch.ts`**
    - Register `firefly_dom_watch` tool
    - Define Zod input schema
    - Call `runDomWatch()` in tool handler

18. **Update `src/server.ts`**
    - Import and register `registerDomInspectTool`
    - Import and register `registerDomWatchTool`

### Phase 7: Testing (File 19)

19. **Create `tests/domInspect.test.ts`**
    - Test tool registration (both tools)
    - Test schema validation
    - Test RingBuffer operations
    - Test locator generation logic
    - Test selector discovery
    - Test shadow DOM traversal
    - Test DOM tree building
    - Test artifact saving (mocked)

### Phase 8: Documentation (File 20)

20. **Update `README.md`**
    - Add `firefly_dom_inspect` to tools list
    - Add `firefly_dom_watch` to tools list
    - Document all modes with examples
    - Document all parameters
    - Add example Claude prompts

---

## Key Design Decisions

### 1. Console/Network in MCP Process (NOT page.evaluate())

Store in `BrowserManager` with `RingBuffer`. Reasons:

- Survives page navigation/reload
- No CSP interference
- No Adobe script overwriting globals
- Robust and simple

```typescript
// BrowserManager
private consoleBuffer = new RingBuffer<ConsoleEntry>(500);

// Listeners installed once per page
page.on("console", (msg) => {
  this.consoleBuffer.add({ timestamp, type, text });
});
```

### 2. RingBuffer for Memory Safety

Fixed-size circular buffer. When full, oldest entries are overwritten. No array growth, no memory leaks.

### 3. Modern Performance APIs

Avoid deprecated `performance.timing`. Use:

```typescript
performance.getEntriesByType("navigation")[0]  // Navigation Timing
performance.getEntriesByType("paint")          // Paint Timing
new PerformanceObserver(...)                    // LCP
```

### 4. Shadow DOM Depth Protection

Default maxDepth: 8. Prevents infinite recursion on complex pages. Configurable via input.

### 5. Locator Uniqueness

Every selector includes `matches` count. If a selector matches 14 elements, it's not useful for automation. This helps identify the best selectors.

### 6. Annotated Screenshots

Numbered labels on discovered elements make debugging take seconds. Instead of reading JSON, Claude can see exactly which button is which.

### 7. ZIP Export

Package everything into one file. Claude inspects one file instead of six.

### 8. Watch Mode

MutationObserver reports exactly when elements appear/disappear. No more guessing when the Generate button loads.

### 9. Read-Only Guarantee

The tool NEVER:

- Navigates (no page.goto)
- Clicks elements
- Types text
- Modifies DOM
- Closes browser
- Reloads page

All operations use `page.evaluate()` (read-only JS execution) or Playwright query methods.

### 10. Error Handling

Each sub-module catches its own errors and returns partial results with warnings. The orchestrator aggregates warnings but doesn't fail the entire inspection if one part fails.

---

## Estimated Lines of Code

| File                                   | Lines          |
| -------------------------------------- | -------------- |
| `src/utils/ringBuffer.ts`              | 60-80          |
| `src/firefly/domInspect.ts`            | 400-500        |
| `src/firefly/domWatch.ts`              | 200-250        |
| `src/firefly/dom/pageInfo.ts`          | 100-120        |
| `src/firefly/dom/selectorDiscovery.ts` | 300-350        |
| `src/firefly/dom/shadowDom.ts`         | 120-140        |
| `src/firefly/dom/accessibility.ts`     | 80-100         |
| `src/firefly/dom/iframes.ts`           | 80-100         |
| `src/firefly/dom/dialogs.ts`           | 60-80          |
| `src/firefly/dom/forms.ts`             | 80-100         |
| `src/firefly/dom/performance.ts`       | 80-100         |
| `src/firefly/dom/locatorGen.ts`        | 200-250        |
| `src/firefly/dom/tree.ts`              | 100-120        |
| `src/firefly/dom/artifacts.ts`         | 150-180        |
| `src/tools/domInspect.ts`              | 150-180        |
| `src/tools/domWatch.ts`                | 80-100         |
| `tests/domInspect.test.ts`             | 200-250        |
| **Total**                              | **~2500-3000** |

---

## Risk Mitigation

1. **Playwright API Changes**: Use `page.evaluate()` for DOM queries which are stable across Playwright versions.

2. **Shadow DOM Access**: Some shadow roots may be closed. Document this limitation and return empty results for inaccessible roots.

3. **Performance Impact**: The full inspection mode may be slow on complex pages. The mode parameter allows focused inspection.

4. **Memory Usage**: RingBuffer with fixed capacity (500) prevents memory leaks. No unbounded arrays.

5. **Large HTML**: Truncate outerHTML to 3000 chars, shadowHTML to 5000 chars to prevent output bloat.

6. **ZIP Size**: Limit total artifact size. Compress HTML/JSON.

7. **Watch Mode Duration**: Maximum 5 minutes (300s) to prevent runaway observers.

---

## Testing Strategy

### Unit Tests (No Browser)

- RingBuffer operations
- Schema validation
- Locator generation logic (mocked elements)
- Selector candidate matching

### Integration Tests (With Browser)

- Tool registration (both tools)
- Full mode returns all sections
- Selector mode returns matching elements
- Shadow mode traverses shadow roots
- Tree mode builds correct structure
- Accessibility mode returns snapshot
- Artifact saving (screenshots, HTML, ZIP)
- Console capture from BrowserManager
- Network capture from BrowserManager
- Watch mode captures mutations

### Smoke Tests

- Verify tools are registered
- Verify schema accepts valid input
- Verify output structure
- Verify no page modifications

---

## Success Criteria

1. ✅ Tools registered as `firefly_dom_inspect` and `firefly_dom_watch`
2. ✅ All five inspection modes work: full, selector, shadow, accessibility, tree
3. ✅ Watch mode captures DOM mutations
4. ✅ Console/network capture stored in MCP process (not page.evaluate())
5. ✅ RingBuffer prevents memory leaks
6. ✅ Screenshots + annotated screenshots saved
7. ✅ ZIP export packages all artifacts
8. ✅ Locator suggestions include uniqueness counts
9. ✅ XPath included alongside CSS and Playwright locators
10. ✅ Shadow DOM traversal depth-limited
11. ✅ Modern Performance APIs (no deprecated timing)
12. ✅ Framework detection (React, Vue, Angular, Lit)
13. ✅ Tool is completely read-only
14. ✅ All tests pass
15. ✅ TypeScript compiles without errors
16. ✅ ESLint passes
17. ✅ README is updated with documentation
