# Project: Anotato Annotely Features Enhancement

## Architecture
Anotato is a client-side screenshot annotation web application built with React, TypeScript, Vite, and Tailwind CSS.

### Coordinate & Rendering Architecture
1. **Interactive Viewport Layer (`CanvasWorkspace.tsx`)**:
   - Container has CSS transform: `translate3d(panX, panY, 0) scale(zoom)`.
   - Dimensions strictly match base screenshot `naturalWidth` × `naturalHeight`.
   - Coordinates in state are stored in intrinsic image pixel space `[0, naturalWidth] × [0, naturalHeight]`.
2. **Interactive SVG Overlay Layer (`SvgOverlay.tsx`)**:
   - Renders SVG viewBox matching `0 0 naturalWidth naturalHeight`.
   - Renders background click catcher, active shapes via `<ShapeRenderer>`, live drag draft preview, `<BadgeRenderer>`, and `<TransformHandles>`.
   - Spotlight Mask: SVG `<mask id="spotlight-mask">` with `<rect fill="white">` base and `<rect fill="black">` cutouts for all highlight annotations.
   - Blur Filter: SVG `<filter id="gaussian-blur">` + `<clipPath>` wrapping an `<image>` element to provide GPU-accelerated live preview.
3. **Composite Canvas 2D Export Engine (`canvasExporter.ts`)**:
   - Creates offscreen `<canvas>` at 1:1 `naturalWidth` × `naturalHeight`.
   - Draws base image at `(0, 0, W, H)`.
   - Applies destructive blur baking directly into the canvas context: `ctx.save(); ctx.clip(); ctx.filter = 'blur(12px)'; ctx.drawImage(baseImg, ...); ctx.restore()`.
   - Applies uniform spotlight dimming layer punched out additively via `globalCompositeOperation = 'destination-out'`.
   - Rasterizes vector shapes (rectangles, ellipses, thick arrows with contrast outline/shadow, callout pins, numbered badges).
   - Generates standard `image/png` blob for clipboard copy and file download.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1.1 | Bold Arrow Shaft | Thicker, bolder arrow shaft (configurable default 6px) with clean notch termination | M1 | ORIGINAL_REQUEST §R1 |
| F1.2 | Polished Arrowhead Geometry | Sharp, well-proportioned arrowhead geometry (30° sweep, recessed notch) matching Annotely | M1 | ORIGINAL_REQUEST §R1 |
| F1.3 | Arrow Contrast Outlines & Shadows | High-contrast underlay stroke/casing and drop shadow for legibility across dark and light backgrounds | M1 | ORIGINAL_REQUEST §R1 |
| F1.4 | Tail-Anchored Badge & Handles | Preserves tail-anchored badge positioning at (startX, startY) and interactive start/end transform handles | M1 | ORIGINAL_REQUEST §R1 |
| F1.5 | Arrow 2D Canvas Export Parity | Identical thick shaft, sharp head, contrast casing, and drop shadow rendered in offscreen 2D canvas | M1 | ORIGINAL_REQUEST §R1 |
| F2.1 | Highlight Tool Definition & State | Tool type 'highlight', box geometry model, activeTool switching, toolbar icon, sidebar sync | M2 | ORIGINAL_REQUEST §R2 |
| F2.2 | Interactive Spotlight Mask | SVG mask with white base and black cutouts over uniform semi-transparent backdrop (rgba(0,0,0,0.45)) | M2 | ORIGINAL_REQUEST §R2 |
| F2.3 | Additive Multi-Region Highlighting | Multiple highlight rectangles merge seamlessly without double-dimming or overlapping dark bands | M2 | ORIGINAL_REQUEST §R2 |
| F2.4 | Highlight 2D Canvas Export Parity | Offscreen canvas export with destination-out punched cutouts over uniform backdrop | M2 | ORIGINAL_REQUEST §R2 |
| F3.1 | Blur Tool Definition & State | Tool type 'blur', box geometry model, activeTool switching, toolbar icon, sidebar sync | M3 | ORIGINAL_REQUEST §R3 |
| F3.2 | Interactive Gaussian Blur Preview | SVG feGaussianBlur filter and clipPath over base image element for responsive live preview | M3 | ORIGINAL_REQUEST §R3 |
| F3.3 | Destructive Blur Canvas Export Baking | Bakes Gaussian blur directly into 2D canvas pixel buffer so sensitive text/pixels are unrecoverable | M3 | ORIGINAL_REQUEST §R3 |
| F3.4 | Blur Fallback & Edge Mode | Clamp/duplicate edge mode handling without dark border artifacts, robust canvas filter fallback | M3 | ORIGINAL_REQUEST §R3 |
| F4.1 | Resolution Scale Metric | computeResolutionScale(w, h) based on natural image dimensions, defaulting to 1.0 for backward compatibility | M4 | ORIGINAL_REQUEST §R4 |
| F4.2 | Scalable Badges & Font Sizes | Proportional scaling of callout badges and font sizes on 2K/4K/Retina screenshots with minimum readable limits | M4 | ORIGINAL_REQUEST §R4 |
| F4.3 | Scalable Pin Markers | Proportional scaling of pin marker head radius, pointer height, and centered numbers | M4 | ORIGINAL_REQUEST §R4 |
| F4.4 | Scalable Transform Selection Handles | Proportional scaling of selection handles and hit targets across image resolutions and zoom levels | M4 | ORIGINAL_REQUEST §R4 |
| F4.5 | Badge Export Scaling Parity | Exact proportional badge and pin scaling applied in 2D canvas exporter matching live canvas appearance | M4 | ORIGINAL_REQUEST §R4 |
| F5.1 | E2E Regression & Quality Suite | Full test suite passing (npm run test, npm run typecheck, npm run lint) with zero errors | M5 | ORIGINAL_REQUEST §Quality |
| F5.2 | Comprehensive E2E Test Suite | Requirement-driven Tiers 1-4 tests (arrow, highlight, blur, resolution scaling) + Tier 5 adversarial hardening | M5 | ORIGINAL_REQUEST §Quality |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Polished Thicker Arrow Tool | F1.1, F1.2, F1.3, F1.4, F1.5 (geometry.ts, ShapeRenderer.tsx, canvasExporter.ts, TransformHandles.tsx) | none | DONE |
| M2 | Additive Highlight / Spotlight Tool | F2.1, F2.2, F2.3, F2.4 (types, state/reducer, SvgOverlay.tsx, ShapeRenderer.tsx, canvasExporter.ts, toolbar/sidebar) | none | DONE |
| M3 | Smooth Blur / Redact Tool | F3.1, F3.2, F3.3, F3.4 (types, state/reducer, SvgOverlay.tsx, canvasExporter.ts, toolbar/sidebar) | M2 (shares tool types) | DONE |
| M4 | Resolution-Aware Scalable Badges & Pins | F4.1, F4.2, F4.3, F4.4, F4.5 (badges.ts, geometry.ts, BadgeRenderer.tsx, ShapeRenderer.tsx, TransformHandles.tsx, canvasExporter.ts) | none | DONE |
| M5 | Final E2E Integration & Verification | F5.1, F5.2: Verification against E2E test suite (Tiers 1-4), adversarial coverage hardening (Tier 5), forensic audit | M1, M2, M3, M4, TEST_READY | DONE |
| E2E | E2E Testing Track | Design and publish comprehensive opaque-box test suite (Tiers 1-4) in TEST_INFRA.md and TEST_READY.md | none | DONE |

---

## Interface Contracts

### 1. Arrow Geometry & Rendering Contract
- `calculateArrowhead(start: Point, end: Point, strokeWidth: number)`:
  - Returns `{ headLength, headWidth, left, right, notch, tip, shaftEnd }`.
  - `shaftEnd`: recessed by `strokeWidth * 0.5` from notch to prevent round linecap penetration.
- `ShapeRenderer.tsx` and `canvasExporter.ts`:
  - Renders underlay casing: `stroke="rgba(0,0,0,0.55)"`, `strokeWidth = strokeWidth + 3.5`.
  - Renders top shaft: `stroke = colorDef.stroke`, `strokeWidth = strokeWidth`.
  - Renders arrowhead polygon: `points = "${tip.x},${tip.y} ${left.x},${left.y} ${notch.x},${notch.y} ${right.x},${right.y}"`, `fill = colorDef.stroke`, with underlay casing or filter drop-shadow.
  - Tail badge anchor preserved at `(start.x, start.y)`.

### 2. Highlight Tool Contract
- `ToolType`: includes `'highlight'`.
- `HighlightGeometry`: `{ type: 'highlight', x: number, y: number, width: number, height: number }`.
- `SvgOverlay.tsx`:
  - `<mask id="spotlight-mask">`: `<rect width="100%" height="100%" fill="white" />` + map over all highlight annotations + live draft: `<rect x={x} y={y} width={w} height={h} fill="black" rx={4} />`.
  - Backdrop: `<rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#spotlight-mask)" pointerEvents="none" />`.
- `canvasExporter.ts`:
  - Offscreen backdrop canvas filled with `rgba(0,0,0,0.45)`.
  - Highlight rects cleared with `ctx.globalCompositeOperation = 'destination-out'`.
  - Backdrop drawn over base image with `ctx.globalCompositeOperation = 'source-over'`.

### 3. Blur / Redact Tool Contract
- `ToolType`: includes `'blur'`.
- `BlurGeometry`: `{ type: 'blur', x: number, y: number, width: number, height: number }`.
- `SvgOverlay.tsx`:
  - `<filter id="gaussian-blur">`: `<feGaussianBlur stdDeviation="10" edgeMode="duplicate" />`.
  - For each blur annotation: `<clipPath id="blur-clip-${id}">`: `<rect x={x} y={y} width={w} height={h} rx={2} />`.
  - `<image href={image.src} width={naturalWidth} height={naturalHeight} filter="url(#gaussian-blur)" clipPath="url(#blur-clip-${id})" />`.
- `canvasExporter.ts`:
  - Destructive baking:
    ```ts
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    if ('filter' in ctx) {
      ctx.filter = 'blur(12px)';
      ctx.drawImage(baseImg, 0, 0, width, height);
    } else {
      // multi-pass downscale/upscale pixel diffusion fallback
      bakeBlurRegionFallback(ctx, x, y, width, height);
    }
    ctx.restore();
    ```

### 4. Resolution Scale Contract
- `src/math/badges.ts`:
  - `computeResolutionScale(width: number, height: number): number`:
    - Returns `clamp(Math.max(width, height) / 1440, 1.0, 4.0)` (or diagonal scale).
  - `getBadgeDimensions(index: number, scale: number = 1.0): BadgeDimensions`:
    - Defaults to `scale = 1.0` for 100% backward compatibility with all existing tests.
    - Scaled width, height, radius, and fontSize: `Math.round(base * scale)`.
- `src/math/geometry.ts`:
  - `getPinBoundingBox(geometry: PinGeometry, scale: number = 1.0)`: scaled dimensions.
- `TransformHandles.tsx`:
  - Selection handles scale with both zoom and resolution scale.

---

## Code Layout
- `src/types/index.ts`: ToolType, geometries (`HighlightGeometry`, `BlurGeometry`), Annotation, AppState.
- `src/math/geometry.ts`: Arrowhead math, notch clearance, pin bounding box.
- `src/math/badges.ts`: `computeResolutionScale`, `getBadgeDimensions`, badge anchor positioning.
- `src/state/appReducer.ts`: Normalization, re-indexing, tool handling for highlight and blur.
- `src/components/canvas/CanvasWorkspace.tsx`: Image container, viewport transforms.
- `src/components/canvas/SvgOverlay.tsx`: Spotlight mask, blur filters, draft rendering.
- `src/components/canvas/ShapeRenderer.tsx`: Arrow rendering (casing + head), highlight/blur borders, pin scaling.
- `src/components/canvas/BadgeRenderer.tsx`: Scaled badge rendering.
- `src/components/canvas/TransformHandles.tsx`: Endpoint handles, corner handles.
- `src/components/toolbar/MainToolbar.tsx`: Highlight and Blur tool buttons, icons, tooltips.
- `src/export/canvasExporter.ts`: 2D canvas composite rasterizer (arrows, destination-out highlight, destructive blur baking, scaled badges).
- `src/utils/sidebar.ts`: Sidebar tags and metadata for Highlight and Blur.
