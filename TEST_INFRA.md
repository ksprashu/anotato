# Annot8: 4-Tier Opaque-Box Test Infrastructure

## 1. Overview & Architecture

The Annot8 test infrastructure is an opaque-box, contract-driven verification engine designed to validate 100% of user requirements, state invariants, spatial transformations, and export fidelity without coupling tests to transient internal implementations.

The test framework operates across four distinct, complementary tiers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TIER 4: Realistic Real-World Workload Scenarios                         │
│ • End-to-end user workflows (Bug report, Design review, Code diff)      │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 3: Cross-Feature Pairwise Interaction Suites                       │
│ • State mutation sequences, undo/redo loops, zoom/pan coordinate sync   │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 2: Boundary, Corner Case & Stress Tests (>=5 per feature)          │
│ • Zero zoom, out-of-bounds coords, 8K retina images, extreme inputs     │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 1: Feature Coverage (>=5 test cases for Features 1 through 23)     │
│ • Pure contract-based verification of every feature in Feature Inventory│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Test Execution Harness (`tests/e2e/test-runner.ts`)

Annot8 provides a standalone, zero-dependency test runner in `tests/e2e/test-runner.ts` that runs in any Node.js environment (v20+) or within Vitest/Jest test environments.

### 2.1 Key Capabilities:
- **Zero External Dependencies**: Built-in assertion engine (`expect`, `toBe`, `toEqual`, `toMatchObject`, `toThrow`, `toBeCloseTo`, etc.).
- **Headless Browser Mock Environment**:
  - `MockCanvas` & `MockCanvasRenderingContext2D`: Tracks 2D drawing paths, image blits, font metrics, and affine transformations.
  - `MockOffscreenCanvas`: Simulates high-DPI unscaled composite PNG generation.
  - `MockClipboard`: Emulates `navigator.clipboard.write` (with `ClipboardItem`) and `navigator.clipboard.writeText`.
  - Synthetic Event Dispatchers: Simulates `ClipboardEvent`, `DragEvent`, `PointerEvent`, `WheelEvent`, and `KeyboardEvent`.
- **ANSI Formatted CLI Output**: Outputs suite-by-suite breakdown, execution times, detailed failure traces, and aggregate metrics.
- **Dual-Mode Execution**:
  - Direct execution: `npx tsx tests/e2e/test-runner.ts`
  - Vitest runner: `npm test` or `npx vitest run`

---

## 3. Feature Mapping Matrix

| Feature # | Feature Name | Tier 1 Tests | Tier 2 Boundaries | Tier 3 Combinations | Tier 4 Workloads |
|:---|:---|:---:|:---:|:---:|:---:|
| **F1** | Image Ingestion via Clipboard (`Cmd+V`) | 5 | 5 | ✓ | ✓ |
| **F2** | Image Ingestion via Drag-and-Drop & Picker | 5 | 5 | ✓ | ✓ |
| **F3** | Focal-Point Invariant Zoom & Pan | 5 | 5 | ✓ | ✓ |
| **F4** | Viewport Auto-Fit & Reset | 5 | 5 | ✓ | ✓ |
| **F5** | Bounding Box Annotation Tool | 5 | 5 | ✓ | ✓ |
| **F6** | Ellipse/Circle Annotation Tool | 5 | 5 | ✓ | ✓ |
| **F7** | Directional Arrow Annotation Tool | 5 | 5 | ✓ | ✓ |
| **F8** | Numbered Callout Pin Tool | 5 | 5 | ✓ | ✓ |
| **F9** | Auto-Numbering Index Badges ($1..N$) | 5 | 5 | ✓ | ✓ |
| **F10** | High-Contrast Color Presets & Styling | 5 | 5 | ✓ | ✓ |
| **F11** | Selection, Move & 8-Point Resize | 5 | 5 | ✓ | ✓ |
| **F12** | Undo & Redo History Stack | 5 | 5 | ✓ | ✓ |
| **F13** | Synchronized Notes Sidebar | 5 | 5 | ✓ | ✓ |
| **F14** | Dynamic Re-Indexing on Delete/Reorder | 5 | 5 | ✓ | ✓ |
| **F15** | Inline Markdown Note Editor | 5 | 5 | ✓ | ✓ |
| **F16** | Bidirectional Hover Highlighting | 5 | 5 | ✓ | ✓ |
| **F17** | 1:1 Native Composite PNG Export | 5 | 5 | ✓ | ✓ |
| **F18** | Copy Image to Clipboard (`Cmd+C`) | 5 | 5 | ✓ | ✓ |
| **F19** | Copy Notes to Clipboard | 5 | 5 | ✓ | ✓ |
| **F20** | File Download Actions | 5 | 5 | ✓ | ✓ |
| **F21** | Responsive Modern UI & Dark/Light Theme | 5 | 5 | ✓ | ✓ |
| **F22** | Tooltips & Keyboard Shortcuts Guide | 5 | 5 | ✓ | ✓ |
| **F23** | Comprehensive Automated E2E Test Suite | 5 | 5 | ✓ | ✓ |
| **TOTAL**| | **115+** | **115+** | **12+** | **5+** |

---

## 4. Test Suite Structure

```
tests/
├── setup.ts                      # Vitest test setup and JSDOM polyfills
├── helpers/
│   └── testFixtures.ts           # Shared test fixtures, mock builders, sample images
├── e2e/
│   ├── test-runner.ts            # Standalone test runner and assertion engine
│   ├── tier1-features.test.ts    # Tier 1: Feature Coverage (>=5 per feature)
│   ├── tier2-boundaries.test.ts  # Tier 2: Boundary & Corner Cases (>=5 per feature)
│   ├── tier3-combinations.test.ts# Tier 3: Cross-Feature Interactions
│   └── tier4-workloads.test.ts   # Tier 4: Realistic End-to-End User Workloads
```

---

## 5. Execution Commands

```bash
# Run full 4-tier E2E test suite via standalone runner
npx tsx tests/e2e/test-runner.ts

# Run individual test tiers
npx tsx tests/e2e/tier1-features.test.ts
npx tsx tests/e2e/tier2-boundaries.test.ts
npx tsx tests/e2e/tier3-combinations.test.ts
npx tsx tests/e2e/tier4-workloads.test.ts

# Run with Vitest (when packages are installed)
npm test
```

---

## 6. Authoritative Specifications & Invariant Contracts

1. **Continuous Index Invariant ($1..N$)**: For any set of $N$ annotations, indices must strictly form $\{1, 2, \dots, N\}$. Any addition, deletion, or reorder instantly re-indexes all elements.
2. **Coordinate Invariance**: All vector annotations, bounding boxes, and handle positions are defined strictly in unscaled natural image coordinates $[0, W_{\text{native}}] \times [0, H_{\text{native}}]$. Viewport zoom and pan only alter display projections.
3. **Focal Zoom Invariance**: Zooming centered at screen position $(x_f, y_f)$ must maintain the exact underlying image pixel beneath the cursor before and after the scale operation:
   $$\mathbf{P}_s^{\text{focal}} = s_{\text{old}} \mathbf{P}_i^{\text{focal}} + \mathbf{T}_{\text{old}} = s_{\text{new}} \mathbf{P}_i^{\text{focal}} + \mathbf{T}_{\text{new}}$$
4. **Export Resolution Invariance**: Composite PNG exports are rendered at $100\%$ unscaled native image dimensions on an offscreen canvas.
