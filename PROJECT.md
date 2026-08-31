# Project: Anotato

## Architecture
Anotato is built with a Layered Hybrid Architecture for ultra-fast 60 FPS viewport interaction and pixel-perfect 1:1 composite export:
1. **Interactive Viewport Layer**:
   - **Base Image Canvas / Layer**: Renders the screenshot at native aspect ratio with hardware-accelerated CSS transforms for pan and zoom.
   - **Interactive SVG Overlay**: Renders all vector shapes (boxes, ellipses, arrows, callout pins) and numbered badges with sub-pixel crispness, hover halos, selection boxes, and 8-point resize handles in image coordinate space.
2. **State & Invariant Management Engine**:
   - **Coordinate Space Model**: Annotations stored strictly in intrinsic image coordinates $[0, W_{\text{native}}] \times [0, H_{\text{native}}]$. Screen $\leftrightarrow$ Image coordinate conversion handles arbitrary pan and zoom without altering geometry data.
   - **Immutable History Stack**: 50-level Undo/Redo stack storing pure annotation and selection state transitions. Intermediate drag/resize movements are batched and committed on `pointerup`.
   - **Dynamic Sequence Invariant ($1..N$)**: Pure reducer ensuring continuous sequential numbering across canvas badges and sidebar items whenever annotations are added, deleted, or reordered.
3. **Synchronized Split-View Notes Engine**:
   - Bidirectional hover highlighting connecting `hoveredAnnotationId` to canvas glow effects and sidebar card accent rings.
   - Inline markdown note editor per annotation with live preview, markdown syntax formatting, and keyboard shortcuts (`Tab`, `Cmd+Enter`, `Escape`).
   - Drag-and-drop and button-based reordering with dynamic re-indexing.
4. **1:1 Native Resolution Export Engine**:
   - Dedicated Offscreen Canvas 2D engine rasterizing the base image at $100\%$ unscaled native pixel resolution, vector shapes with precise stroke scaling, and drop-shadowed numbered callout badges.
   - Asynchronous Clipboard API integrating `image/png` binary blob copy and `text/plain` formatted markdown copy with automatic fallback to file downloads.
5. **Modern UI & Theming System**:
   - Dark / light mode support with semantic Tailwind tokens.
   - Accessible toolbars, floating palettes, keybinding tooltips, and modal shortcuts cheat-sheet.

## Code Layout
```
anotato/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   └── index.ts                 # Core data models, geometries, styles, state
│   ├── constants/
│   │   ├── colors.ts                # Preset color palettes (Red, Potato Gold, Green, Cyan, Purple)
│   │   └── shortcuts.ts             # Keyboard shortcuts definition and mappings
│   ├── state/
│   │   ├── appReducer.ts            # Immutable state reducer with 1..N reindexing invariant
│   │   ├── historyManager.ts        # 50-step undo/redo stack & transaction batching
│   │   └── AppContext.tsx           # Context & custom hook providers
│   ├── math/
│   │   ├── coordinates.ts           # Screen <-> Image affine transforms & zoom focal point math
│   │   ├── geometry.ts              # Arrowheads (30 deg wings), box/circle hit testing, handle math
│   │   └── badges.ts                # Badge anchoring calculations per shape type
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── CanvasWorkspace.tsx  # Main zoom/pan canvas container & event dispatcher
│   │   │   ├── SvgOverlay.tsx       # Interactive SVG vector renderer
│   │   │   ├── ShapeRenderer.tsx    # Individual shape rendering (Box, Circle, Arrow, Pin)
│   │   │   ├── BadgeRenderer.tsx    # Sequential numbered badge overlay
│   │   │   └── TransformHandles.tsx # 8-point resize handles & selection box
│   │   ├── sidebar/
│   │   │   ├── NotesSidebar.tsx     # Collapsible notes split-view panel
│   │   │   ├── NoteCard.tsx         # Individual annotation note card with type tag & badge
│   │   │   └── MarkdownEditor.tsx   # Rich inline markdown editor with preview
│   │   ├── toolbar/
│   │   │   ├── MainToolbar.tsx      # Tool selection (Box, Circle, Arrow, Pin, Select, Pan)
│   │   │   ├── ColorPalette.tsx     # 5 high-contrast preset color picker & stroke/opacity controls
│   │   │   ├── ZoomControls.tsx     # Zoom in, zoom out, fit-to-screen, 100% reset
│   │   │   └── HistoryControls.tsx  # Undo, redo, clear all, replace image
│   │   ├── export/
│   │   │   ├── ExportActions.tsx    # Copy Image (Cmd+C), Copy Notes, Export PNG, Export Markdown
│   │   │   └── ToastNotification.tsx# Feedback toast for clipboard actions & errors
│   │   └── modals/
│   │       └── ShortcutsModal.tsx   # Keyboard shortcuts reference guide modal
│   ├── export/
│   │   ├── canvasExporter.ts        # 1:1 native offscreen composite PNG rasterizer
│   │   ├── markdownSerializer.ts    # Structured markdown generator (list & table)
│   │   └── clipboard.ts             # Async Clipboard API wrapper & download fallbacks
│   └── hooks/
│       ├── useClipboardPaste.ts     # Global paste handler (Cmd+V) & file drop
│       ├── useKeyboardShortcuts.ts  # Global keyboard event dispatcher
│       └── useTheme.ts              # Dark / light theme manager
└── tests/
    ├── setup.ts
    ├── unit/
    │   ├── coordinates.test.ts      # Focal point invariance & affine coordinate math
    │   ├── geometry.test.ts         # Arrowhead geometry, bounding calculations, hit testing
    │   ├── appReducer.test.ts       # 1..N reindexing, undo/redo, shape creation/mutation
    │   └── markdownSerializer.test.ts # Structured markdown generation
    ├── component/
    │   ├── NotesSidebar.test.tsx    # Sidebar synchronization, reorder, delete
    │   ├── MainToolbar.test.tsx     # Tool selection, color palette, shortcut triggers
    │   └── MarkdownEditor.test.tsx  # Inline note editing, formatting preview
    ├── integration/
    │   ├── canvasExport.test.ts     # Offscreen 1:1 PNG rendering & clipboard export
    │   └── canvasSidebarSync.test.ts# Bidirectional hover & live shape updates
    └── e2e/
        ├── test-runner.ts           # Opaque-box E2E test runner harness
        ├── tier1-features.test.ts   # Tier 1: Feature Coverage (>=5 per feature)
        ├── tier2-boundaries.test.ts # Tier 2: Boundary & Corner Cases (>=5 per feature)
        ├── tier3-combinations.test.ts # Tier 3: Cross-Feature Interactions
        └── tier4-workloads.test.ts  # Tier 4: Real-World Workload Scenarios
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Image Ingestion via Clipboard (`Cmd+V`) | Global paste listener decoding image blobs into native resolution bitmaps | M2 | ORIGINAL_REQUEST §R1 |
| 2 | Image Ingestion via Drag-and-Drop & Picker | Drop zone and file input for PNG, JPEG, WebP files | M2 | ORIGINAL_REQUEST §R1 |
| 3 | Focal-Point Invariant Zoom & Pan | Smooth wheel/pinch zoom centered on cursor, space+drag/middle-click pan | M2 | ORIGINAL_REQUEST §R1 |
| 4 | Viewport Auto-Fit & Reset | Initial auto-fit preserving aspect ratio, 1:1 zoom reset, canvas reset | M2 | ORIGINAL_REQUEST §R1 |
| 5 | Bounding Box Annotation Tool | Rectangular vector annotation with stroke, fill opacity, and badge | M3 | ORIGINAL_REQUEST §R2 |
| 6 | Ellipse/Circle Annotation Tool | Circular/oval vector annotation with center-drag / corner-drag | M3 | ORIGINAL_REQUEST §R2 |
| 7 | Directional Arrow Annotation Tool | Vector arrow with precise 30° arrowhead wings and tail-anchored badge | M3 | ORIGINAL_REQUEST §R2 |
| 8 | Numbered Callout Pin Tool | Teardrop/circle pin badge placed directly at target point | M3 | ORIGINAL_REQUEST §R2 |
| 9 | Auto-Numbering Index Badges ($1..N$) | Automatic continuous sequential numbering badge placed on all elements | M3 | ORIGINAL_REQUEST §R2 |
| 10 | High-Contrast Color Presets & Styling | 5 presets: Red (#EF4444), Amber (#F59E0B), Green (#10B981), Cyan (#06B6D4), Purple (#8B5CF6) | M3 | ORIGINAL_REQUEST §R2 |
| 11 | Selection, Move & 8-Point Resize | Interactive selection with 8 resize handles and bounding box | M3 | ORIGINAL_REQUEST §R2 |
| 12 | Undo & Redo History Stack | 50-step immutable history stack with pointerup transaction batching | M3 | ORIGINAL_REQUEST §R2 |
| 13 | Synchronized Notes Sidebar | Collapsible split-view displaying ordered annotation cards | M4 | ORIGINAL_REQUEST §R3 |
| 14 | Dynamic Re-Indexing on Delete/Reorder | Delete or reorder dynamically renumbers remaining badges 1..N across UI | M4 | ORIGINAL_REQUEST §R3 |
| 15 | Inline Markdown Note Editor | Per-annotation markdown input with live preview and keyboard shortcuts | M4 | ORIGINAL_REQUEST §R3 |
| 16 | Bidirectional Hover Highlighting | Hovering sidebar highlights canvas shape/badge glow and vice versa | M4 | ORIGINAL_REQUEST §R3 |
| 17 | 1:1 Native Composite PNG Export | Offscreen canvas composite rendering unscaled base image + crisp vectors | M5 | ORIGINAL_REQUEST §R4 |
| 18 | Copy Image to Clipboard (`Cmd+C`) | Single-click / shortcut write of `image/png` to navigator.clipboard | M5 | ORIGINAL_REQUEST §R4 |
| 19 | Copy Notes to Clipboard | Single-click export of structured numbered markdown list as `text/plain` | M5 | ORIGINAL_REQUEST §R4 |
| 20 | File Download Actions | Direct PNG and Markdown (.md) file download options | M5 | ORIGINAL_REQUEST §R4 |
| 21 | Responsive Modern UI & Dark/Light Theme | Clean, fast dark/light theme with CSS variables and Tailwind | M6 | ORIGINAL_REQUEST §R5 |
| 22 | Tooltips & Keyboard Shortcuts Guide | Toolbars with shortcut tooltips and full shortcuts cheat-sheet modal | M6 | ORIGINAL_REQUEST §R5 |
| 23 | Comprehensive Automated E2E Test Suite | 4-Tier opaque-box test suite verifying 100% requirements | M7 / E2E Track | ORIGINAL_REQUEST §Acceptance Criteria |
| 24 | Open Source & Non-Affiliation Disclaimers | README.md, LICENSE (Apache 2.0), CONTRIBUTING.md with non-affiliation and no-SLA disclaimers | M-Rel-1 | ORIGINAL_REQUEST §R1 |
| 25 | GA4 Analytics & Custom Telemetry Module | G-RN4Y25GBXM in index.html, src/analytics/telemetry.ts for paste, copy, annotate events | M-Rel-2 | ORIGINAL_REQUEST §R2 |
| 26 | Offline Caching & Bot Attack Protection | Content-hashed static caching, no-cache HTML, Nginx 30r/s rate limiting & connection limits | M-Rel-3 | ORIGINAL_REQUEST §R3 |
| 27 | Multi-Stage Dockerfile & Cloud Run Deploy Script | Lean Docker image, parameterized deploy.sh (env/arg project, default region us-central1, min 0, max 5, concurrency 80) | M-Rel-4 | ORIGINAL_REQUEST §R4 |
| 28 | Git Scaffolding & Atomic Commit History | Clean .gitignore, git init, 10-step atomic commit progression | M-Rel-5 | ORIGINAL_REQUEST §R5 |
| 29 | GitHub Repository Link & Cloud Deployment | gh repo create ksprashu/anotato, remote push, and Cloud Run service validation | M-Rel-6 | ORIGINAL_REQUEST §R4, §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Scaffolding, Toolchain & Core Models | Vite, React 18/19, TypeScript, Tailwind, Lucide, Vitest, types, reducer, geometry math | none | DONE |
| M2 | Image Ingestion & Canvas Zoom/Pan | Clipboard paste (`Cmd+V`), file drop, viewport math, focal zoom, pan, reset | M1 | DONE |
| M3 | Vector Annotation Toolkit & History | Box, circle, arrow, pin tools, drag preview, auto-numbering, 8 handles, 50-step undo/redo | M1, M2 | DONE |
| M4 | Notes Sidebar & Bidirectional Sync | Split-view sidebar, inline markdown notes, dynamic re-indexing ($1..N$), bidirectional hover | M1, M3 | DONE |
| M5 | 1:1 Composite Export & Clipboard | Offscreen 1:1 PNG rasterizer, `image/png` clipboard, markdown export, download fallback | M1, M3, M4 | DONE |
| M6 | UI Polish, Theming & Shortcuts Modal | Dark/light theme, toolbar tooltips, shortcuts modal, performance tuning | M2, M4, M5 | DONE |
| M7 | Final Milestone: E2E Pass & Hardening | Pass 100% E2E test suite (Tiers 1-4) + Tier 5 adversarial hardening + production build | M1-M6, E2E Track | DONE |
| M-Rel-1 | Open Source Disclaimers & Governance | README.md, LICENSE (Apache 2.0), CONTRIBUTING.md, .github templates with non-affiliation disclaimers | M7 | DONE |
| M-Rel-2 | GA4 Telemetry & Event Hooks | G-RN4Y25GBXM in index.html, src/analytics/telemetry.ts, paste/copy/annotate hooks & tests | M7 | DONE |
| M-Rel-3 | Offline Caching & Bot Protection | Nginx rate limiting (30r/s), caching headers, security headers, offline client-side guarantee | M-Rel-2 | DONE |
| M-Rel-4 | Dockerfile & Cloud Run deploy.sh | Multi-stage Dockerfile, parameterized deploy.sh with env/arg support, --min-instances=0, --max-instances=5 | M-Rel-3 | DONE |
| M-Rel-5 | Git Scaffolding & Atomic Commits | Clean .gitignore, git init, 10 conventional atomic commits | M-Rel-1, M-Rel-4 | DONE |
| M-Rel-6 | Acceptance Verification & Release Push | Full build & test pass, GitHub repo create & push, Cloud Run deploy verification | M-Rel-5 | DONE |

## Interface Contracts
### `src/types/index.ts`
```typescript
export type ToolType = 'select' | 'pan' | 'box' | 'ellipse' | 'arrow' | 'pin';

export type PresetColor = 'red' | 'amber' | 'green' | 'cyan' | 'purple';

export interface ColorDefinition {
  id: PresetColor;
  name: string;
  stroke: string;
  fill: string;
  badgeBg: string;
  badgeText: string;
}

export interface Point {
  x: number; // In natural image coordinates
  y: number;
}

export interface BoxGeometry {
  type: 'box';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseGeometry {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ArrowGeometry {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface PinGeometry {
  type: 'pin';
  x: number;
  y: number;
}

export type AnnotationGeometry = BoxGeometry | EllipseGeometry | ArrowGeometry | PinGeometry;

export interface AnnotationStyle {
  color: PresetColor;
  strokeWidth: number;
  fillOpacity: number;
}

export interface Annotation {
  id: string; // UUID v4
  index: number; // 1-based sequential visual badge number (1..N)
  geometry: AnnotationGeometry;
  style: AnnotationStyle;
  note: string; // Markdown formatted note
  createdAt: number;
  updatedAt: number;
}

export interface BaseImage {
  id: string;
  src: string; // Object URL or Data URL
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
  fileSize: number;
}

export interface ViewportState {
  zoom: number; // Scale factor (e.g. 1.0 = 100%)
  panX: number; // Translation in viewport pixels
  panY: number;
}

export interface AppState {
  image: BaseImage | null;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  hoveredAnnotationId: string | null;
  activeTool: ToolType;
  activeColor: PresetColor;
  activeStrokeWidth: number;
  activeFillOpacity: number;
  viewport: ViewportState;
  isSidebarOpen: boolean;
  theme: 'dark' | 'light';
}
```
