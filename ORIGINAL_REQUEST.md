# Original User Request

## Initial Request — 2026-08-31T14:45:09Z

Anotato is a screenshot annotation and note-taking web application designed for developer coding harnesses. It allows users to instantly paste clipboard images, add numbered visual annotations (bounding boxes, circles, arrows, callout pins), write structured notes for each annotation in a synchronized sidebar, and copy both the composite annotated image (PNG) and markdown notes to the system clipboard via single-click actions and keyboard shortcuts.

Working directory: .
Integrity mode: demo

## Requirements

### R1. Clipboard-First Canvas & Image Ingestion
- Allow immediate image pasting (`Cmd+V` / `Ctrl+V`) from system clipboard directly into the workspace canvas, alongside file drag-and-drop or file picker upload.
- Automatically fit pasted images to viewport while maintaining full original resolution and aspect ratio, with zoom (scroll wheel / pinch) and pan (space + drag / middle click) controls.
- Support canvas reset, clear annotations, and replacing the base image.

### R2. Visual Annotation Toolkit & Auto-Numbering
- Provide vector-based annotation tools:
  - Bounding boxes (rectangles with customizable fill opacity and stroke color/width)
  - Ellipses / circles
  - Directional arrows and pointers
  - Numbered callout pins (auto-incrementing badges: 1, 2, 3...)
- Every drawn annotation automatically receives a sequential index badge placed on the element.
- Allow selecting, moving, resizing, styling (high-contrast preset colors like Red, Amber/Potato Gold, Green, Cyan, Purple), and deleting annotations.
- Full Undo (`Cmd+Z` / `Ctrl+Z`) and Redo (`Cmd+Shift+Z` / `Ctrl+Y`) history stack.

### R3. Synchronized Split-View Annotation Notes Panel
- Collapsible sidebar panel displaying the ordered list of active annotations matching their canvas sequence numbers.
- Each list item provides:
  - Sequence badge matching canvas color and number
  - Annotation type tag (Box, Arrow, Circle, Pin)
  - Rich inline text/markdown input to describe the issue, question, or requested change
  - Delete and reorder controls that dynamically re-index all annotations and canvas badges
  - Canvas hover highlight (hovering an item in the sidebar highlights the corresponding annotation on the canvas, and vice versa).

### R4. High-Fidelity Clipboard Export & Keyboard Shortcuts
- "Copy Image" button and `Cmd+C` / `Ctrl+C` keyboard shortcut that renders the full composite canvas (base image + drawn shapes + numbered callout badges) to system clipboard as a standard `image/png` blob ready for direct paste into coding harnesses, chat tools, and markdown editors.
- "Copy Notes" button that copies the formatted markdown list of numbered annotations and their descriptions to the clipboard as `text/plain`.
- Single-click combined copy action or download actions (export PNG, export Markdown).

### R5. Responsive Modern UI & Theme
- Fast, clean, dark/light theme UI with intuitive toolbar shortcuts, tooltips displaying keybindings, and zero lag on high-DPI screenshots.

## Acceptance Criteria

### Ingestion & Canvas Performance
- [ ] Pasting an image via `Cmd+V` renders immediately on canvas at native resolution without blurring or distortion.
- [ ] Zoom and pan work smoothly across large retina/4K screenshots.

### Annotation & Synchronization
- [ ] Users can draw rectangles, circles, arrows, and callout pins onto the image with active drag previews.
- [ ] Numbered badges auto-increment (1, 2, 3...) and immediately reflect in the sidebar list.
- [ ] Modifying an annotation's color or position updates immediately on the canvas.
- [ ] Deleting or re-ordering an annotation re-indexes remaining badges sequentially on both canvas and sidebar.
- [ ] Undo and redo actions correctly restore both canvas shapes and sidebar notes state.

### Clipboard & Export Verification
- [ ] Triggering "Copy Image" (button or `Cmd+C`) writes a valid `image/png` to navigator clipboard containing base image and all visual annotations.
- [ ] Triggering "Copy Notes" writes structured markdown to clipboard formatted as numbered items with descriptions.
- [ ] Exported PNG maintains crisp 1:1 pixel rendering matching original screenshot dimensions.

### Automated Tests & Quality
- [ ] Automated unit and component test suite covering canvas annotation state management, numbering sequence calculations, undo/redo reducer, and export payload generation.
- [ ] Production build succeeds with zero TypeScript errors and zero linter warnings.

## Follow-up — 2026-09-13T16:32:40Z

Resolve image paste ghost annotations and support replacement/layering options, quantize mouse wheel zoom to standard preset steps, ensure responsive toolbar visibility on compact viewports, and update stroke width and fill opacity controls in Anotato.

Working directory: c:/Users/kspra/code/github/anotato-paste-zoom-fixes
Integrity mode: development

## Requirements

### R1. Fix Ghost Annotations on Image Paste & Provide Explicit Paste Options
- When a new image is pasted or loaded over an existing annotated canvas, previous annotations must be completely and reliably purged if the user chooses to discard them (eliminating ghost annotations).
- Provide a replacement modal offering three distinct actions when pasting over an active session:
  1. "Replace & Clear Annotations": replaces the base image and completely resets all existing annotations and notes.
  2. "Replace & Keep Annotations": replaces the underlying image while preserving current annotation shapes and notes in place.
  3. "Add as Layer / Overlay": places the newly pasted image as an overlay/layer on top of the current canvas without replacing the base image or wiping annotations.
- Ensure that replacing or pasting an image does not unintentionally modify the fill opacity or visual styles of retained annotations.

### R2. Calibrate Mouse Scroll Wheel Zoom Increments
- Prevent erratic and extreme zoom jumps (such as 13% leaping to 200%) when zooming via mouse scroll wheel or trackpad.
- Quantize wheel zoom steps to follow the established zoom preset scale (10%, 25%, 33%, 50%, 67%, 75%, 100%, 125%, 150%, 200%) matching the UI selector, smoothly scaling centered around the mouse cursor coordinates.

### R3. Responsive Annotation Toolbar Layout
- Prevent the annotation drawing toolbar, color palette, and action tools from getting clipped or hidden on smaller viewports or narrow windows.
- The toolbar and its controls must remain visible and accessible at all times, wrapping into a multi-row or responsive layout without hiding essential drawing tools behind hidden overflow menus.

### R4. Distinct Stroke Width Presets
- Update stroke width options from 2px / 4px / 6px to 2px / 4px / 8px so each preset provides clear, visually distinct line weights.

### R5. Explicit Fill Opacity Controls
- Clarify the 0%, 15%, 30%, 50% controls with explicit labeling (e.g., "Fill" label or visual indicator) so their function as shape background fill opacity is immediately obvious.
- Ensure clicking opacity presets immediately updates any currently selected shape's fill opacity and applies to subsequent shape creations, with clear visual active-state indicators.

## Verification Resources

- Test suite: npm test
- Type checking: npm run typecheck
- Lint check: npm run lint
- Production build: npm run build
- Relevant test specifications:
  - tests/component/ReplaceImageModal.test.tsx
  - tests/component/ZoomControls.test.tsx
  - tests/component/ColorPalette.test.tsx
  - tests/component/MainToolbar.test.tsx
  - tests/stress/zoom_coordinates_adversarial.test.ts

## Acceptance Criteria

### Image Paste & Layering
- [ ] Selecting "Replace & Clear Annotations" purges all previous annotations from both application state and rendered SVG elements with 0 residual ghost annotations.
- [ ] Selecting "Replace & Keep Annotations" swaps the base image while retaining existing annotations, indices, and sidebar notes.
- [ ] Selecting "Add as Layer / Overlay" adds the pasted image onto the canvas without clearing the base image or existing annotations.
- [ ] Confirming replacement does not alter existing annotation style properties (e.g., opacity values remain unchanged unless explicitly modified).

### Viewport Zoom
- [ ] Mouse wheel zooming transitions monotonically through the discrete zoom preset ladder without jumping multiple tiers in a single tick.
- [ ] Focal point centering around cursor coordinates is preserved during wheel zoom transitions.

### Responsive Toolbar
- [ ] All drawing tools (Select, Box, Ellipse, Arrow, Pin, Pan) and styling controls remain rendered and interactive at viewport widths down to 768px and 640px.
- [ ] Controls wrap cleanly without horizontal viewport clipping or overflow hiding.

### Styling Controls
- [ ] Stroke width presets offer 2px, 4px, and 8px options, each applying distinct border thickness to annotations.
- [ ] Opacity options (0%, 15%, 30%, 50%) feature descriptive labeling ("Fill" or icon) and immediately reflect active fill opacity on both the canvas and active state indicator.

### Quality Gate
- [ ] All new and existing unit, component, and stress tests pass via npm test.
- [ ] TypeScript compilation (npm run typecheck) passes with 0 errors.
- [ ] ESLint validation (npm run lint) passes with 0 errors.
- [ ] Production build (npm run build) completes successfully.

