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
