# Project: Anotato Paste, Zoom & Controls Enhancements

## Architecture
Anotato is a React + TypeScript + Tailwind CSS screenshot annotation web application built on Vite.
- **State Management**: Redux-style reducer (`src/state/appReducer.ts`) with typed actions (`src/types/index.ts`).
- **Canvas & Viewport**: SVG overlay (`SvgOverlay.tsx`) on top of base image/overlays inside `CanvasWorkspace.tsx`. Coordinate transformations and focal-point math handled by `src/math/coordinates.ts`.
- **Toolbar & Modals**: Top navigation/toolbar (`App.tsx`, `MainToolbar.tsx`, `ColorPalette.tsx`, `ZoomControls.tsx`) and dialogs (`ReplaceImageModal.tsx`).
- **Export Engine**: `src/export/canvasExporter.ts` composites base image, overlays, shapes, and badges to 1:1 PNG blobs.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1.1 Replace & Clear | Purge all previous annotations from state and SVG on image replace with 0 ghost annotations | M1 | ORIGINAL_REQUEST.md § R1 |
| 2 | R1.2 Replace & Keep | Replace base image while preserving existing annotations, indices, and sidebar notes in place | M1 | ORIGINAL_REQUEST.md § R1 |
| 3 | R1.3 Add as Layer | Add pasted image as an overlay layer on canvas without clearing base image or annotations | M1 | ORIGINAL_REQUEST.md § R1 |
| 4 | R1.4 Style Retention | Preserving annotations retains existing style properties (color, strokeWidth, fillOpacity) | M1 | ORIGINAL_REQUEST.md § R1 |
| 5 | R1.5 Replace Modal UI | ReplaceImageModal offers 3 distinct action buttons with high-contrast styling and ARIA dialog | M1 | ORIGINAL_REQUEST.md § R1 |
| 6 | R2.1 Wheel Delta Stabilization | Prevent erratic zoom factor leaps (e.g. 13% to 200%) from wheel/trackpad delta bursts | M2 | ORIGINAL_REQUEST.md § R2 |
| 7 | R2.2 Preset Ladder Quantization | Quantize wheel zoom to monotonic single-step transitions across 10-preset ladder: [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00] | M2 | ORIGINAL_REQUEST.md § R2 |
| 8 | R2.3 Focal Point Centering | Preserve mouse cursor focal point centering invariance during wheel zoom transitions | M2 | ORIGINAL_REQUEST.md § R2 |
| 9 | R2.4 Zoom Dropdown Alignment | Update ZoomControls dropdown selector to present full 10-step preset ladder | M2 | ORIGINAL_REQUEST.md § R2 |
| 10 | R3.1 Responsive Tool Visibility | All drawing tools and styling controls remain rendered and interactive at <=768px and 640px viewports | M3 | ORIGINAL_REQUEST.md § R3 |
| 11 | R3.2 Responsive Toolbar Wrapping | Elastic multi-row header layout wrapping cleanly without horizontal overflow clipping | M3 | ORIGINAL_REQUEST.md § R3 |
| 12 | R4.1 2px/4px/8px Stroke Presets | Update stroke width presets from [2, 4, 6] to [2, 4, 8] with distinct visual weights | M3 | ORIGINAL_REQUEST.md § R4 |
| 13 | R4.2 Stroke Application | Selecting stroke preset immediately updates selected shape and future drawn shapes | M3 | ORIGINAL_REQUEST.md § R4 |
| 14 | R5.1 Explicit Fill Label | Add visible descriptive "Fill" label or visual indicator to opacity controls (0%, 15%, 30%, 50%) | M3 | ORIGINAL_REQUEST.md § R5 |
| 15 | R5.2 Opacity Application | Selecting opacity preset updates active shape and future shapes on canvas immediately | M3 | ORIGINAL_REQUEST.md § R5 |
| 16 | R5.3 Visual Active Indicators | High-contrast amber accent indicator on the currently active opacity preset button | M3 | ORIGINAL_REQUEST.md § R5 |
| 17 | QG.1 Test Suite 100% Pass | Pass all existing and new unit, component, and stress tests via npm test | M4 | ORIGINAL_REQUEST.md § QG |
| 18 | QG.2 TypeScript Clean | 0 type errors via npm run typecheck | M4 | ORIGINAL_REQUEST.md § QG |
| 19 | QG.3 ESLint Clean | 0 linter errors via npm run lint | M4 | ORIGINAL_REQUEST.md § QG |
| 20 | QG.4 Production Build | Production build succeeds via npm run build | M4 | ORIGINAL_REQUEST.md § QG |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Ingestion & Paste Modal | R1.1–R1.5: Fix ghost annotations, replace modal 3 actions, overlay support, style retention | none | DONE |
| M2 | Wheel Zoom Quantization | R2.1–R2.4: Preset ladder quantization, cursor focal point centering, ZoomControls alignment | M1 | DONE |
| M3 | Toolbar & Styling Controls | R3.1–R3.2, R4.1–R4.2, R5.1–R5.3: Responsive toolbar wrapping, stroke width 2/4/8px, fill opacity label & indicators | none | DONE |
| M4 | Final Milestone E2E & Hardening | QG.1–QG.4: Pass 100% E2E test suite (Tiers 1-4) and adversarial coverage hardening (Tier 5) | M1, M2, M3, E2E Track | DONE |
| E2E | E2E Testing Track | Independent opaque-box test suite for R1–R5 across Tiers 1–4, publishing TEST_READY.md | none | DONE |

## Interface Contracts

### M1 (Ingestion & Paste) ↔ State & Canvas
- **Actions**:
  - `REPLACE_IMAGE_AND_CLEAR`: payload `{ image: CanvasImage }` -> clears `annotations: []`, `selectedAnnotationId: null`, `overlays: []`, resets history.
  - `REPLACE_IMAGE_AND_KEEP`: payload `{ image: CanvasImage }` -> preserves `annotations: state.annotations`, `selectedAnnotationId: state.selectedAnnotationId`, resets history.
  - `ADD_IMAGE_OVERLAY`: payload `{ overlay: ImageOverlay }` -> appends to `state.overlays`.
- **Modal Component (`ReplaceImageModal.tsx`)**:
  - `onReplaceClear: () => void` (testid: `replace-modal-confirm-btn` / `replace-modal-replace-clear-btn`)
  - `onReplaceKeep: () => void` (testid: `replace-modal-replace-keep-btn`)
  - `onAddLayer: () => void` (testid: `replace-modal-add-layer-btn`)
  - `onCancel: () => void` (testid: `replace-modal-cancel-btn`)

### M2 (Wheel Zoom) ↔ Math & Coordinates
- **Preset Scale**:
  `export const ZOOM_PRESETS = [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00] as const;`
- **Function**:
  `export function quantizeWheelZoom(currentZoom: number, deltaY: number): number;`
  Monotonically moves index by +1 (deltaY < 0, zoom in) or -1 (deltaY > 0, zoom out) clamped to ladder bounds.
- **Focal Point Invariance**:
  `computeZoomTransform(viewport, focalPointScreen, quantizedZoom, MIN_ZOOM, MAX_ZOOM)` maintains screen cursor stability.

### M3 (Toolbar & Styling) ↔ UI & ColorPalette
- **Stroke Width Options**:
  `export const STROKE_WIDTH_OPTIONS = [2, 4, 8] as const;` (buttons: `stroke-btn-2`, `stroke-btn-4`, `stroke-btn-8`).
- **Fill Opacity Options**:
  `export const FILL_OPACITY_OPTIONS = [{ value: 0, label: '0%' }, { value: 0.15, label: '15%' }, { value: 0.3, label: '30%' }, { value: 0.5, label: '50%' }] as const;`
- **Label**:
  `<span data-testid="fill-opacity-label" className="...">Fill</span>`

## Code Layout
- `src/state/appReducer.ts`: App state reducer, action handlers (Owned by M1)
- `src/types/index.ts`: TypeScript types and interfaces (Owned by M1)
- `src/hooks/useClipboardPaste.ts`: Clipboard event listeners, paste interception (Owned by M1)
- `src/components/modals/ReplaceImageModal.tsx`: Paste replacement dialog (Owned by M1)
- `src/export/canvasExporter.ts`: PNG export engine (Owned by M1)
- `src/math/coordinates.ts`: Coordinate and zoom math functions (Owned by M2)
- `src/components/toolbar/ZoomControls.tsx`: Zoom toolbar selector (Owned by M2)
- `src/components/canvas/CanvasWorkspace.tsx`: Canvas container & wheel event listener (Owned by M2; M1 adds overlay SVG elements)
- `src/App.tsx`: Root layout, header, responsive wrapper (Owned by M3)
- `src/components/toolbar/ColorPalette.tsx`: Stroke and opacity controls (Owned by M3)
- `tests/component/ReplaceImageModal.test.tsx`: Tests for paste modal (Owned by M1)
- `tests/component/ZoomControls.test.tsx`: Tests for zoom controls (Owned by M2)
- `tests/stress/zoom_coordinates_adversarial.test.ts`: Tests for wheel zoom math (Owned by M2)
- `tests/component/ColorPalette.test.tsx`: Tests for stroke and opacity controls (Owned by M3)
- `tests/component/MainToolbar.test.tsx`: Tests for responsive toolbar (Owned by M3)
- `tests/e2e/**`: E2E test suite (Owned by E2E Testing Track)
