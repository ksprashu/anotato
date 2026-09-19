# Annot8: 4-Tier Opaque-Box Test Infrastructure

## 1. Overview & Architecture

The Annot8 test infrastructure is an opaque-box, contract-driven verification engine designed to validate 100% of user requirements, state invariants, spatial transformations, and export fidelity without coupling tests to transient internal implementations.

The test framework operates across four distinct, complementary tiers covering both baseline features and the paste, zoom, responsive layout, and styling enhancements:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TIER 4: Realistic Real-World Workload Scenarios                         │
│ • End-to-end user workflows (Bug report, Tablet layout, Code diff)      │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 3: Cross-Feature Pairwise Interaction Suites                       │
│ • State mutation sequences, zoom/paste combos, overlay layering         │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 2: Boundary, Corner Case & Stress Tests (>=5 per feature)          │
│ • Delta bursts, extreme deltaY, 0/50 annotations, 8K overlays, clamps   │
├─────────────────────────────────────────────────────────────────────────┤
│ TIER 1: Feature Coverage (>=5 test cases per feature for R1 through R5) │
│ • Pure contract-based verification of every requirement & action        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Test Execution Harness (`tests/e2e/test-runner.ts`)

Annot8 provides a standalone, zero-dependency test runner in `tests/e2e/test-runner.ts` that executes in any Node.js environment (v20+) or within Vitest/Jest test environments.


### 2.1 Key Capabilities:
- **Zero External Dependencies**: Built-in assertion engine (`expect`, `toBe`, `toEqual`, `toMatchObject`, `toThrow`, `toBeCloseTo`, `toHaveLength`, `toContain`, etc.).
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

## 3. Requirements & Feature Mapping Matrix

### 3.1 Enhancement Requirements (R1 through R5)

| Requirement | Description | Tier 1 Tests | Tier 2 Boundaries | Tier 3 Combinations | Tier 4 Workloads | Total Tests |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **R1** | Image Paste Modes, Ghost Elimination & Layering (R1.1–R1.5) | 6 | 6 | ✓ | ✓ | 12+ |
| **R2** | Mouse Wheel Zoom Quantization & Focal Centering (R2.1–R2.4) | 5 | 6 | ✓ | ✓ | 11+ |
| **R3** | Responsive Annotation Toolbar Layout (R3.1–R3.2) | 5 | 5 | ✓ | ✓ | 10+ |
| **R4** | Distinct Stroke Width Presets [2, 4, 8] (R4.1–R4.2) | 5 | 5 | ✓ | ✓ | 10+ |
| **R5** | Explicit Fill Opacity Controls [0, 15, 30, 50]% (R5.1–R5.3) | 5 | 5 | ✓ | ✓ | 10+ |
| **Cross-Combos** | Pairwise Feature Interactions | — | — | 10 | — | 10 |
| **Workloads** | Real-World Developer Workflows | — | — | — | 5 | 5 |
| **Enhancement Subtotal** | | **26** | **27** | **10** | **5** | **68** |

### 3.2 Baseline Core Feature Inventory (F1 through F23)

| Feature # | Feature Name | Tier 1 Tests | Tier 2 Boundaries | Tier 3 Combinations | Tier 4 Workloads | Total Tests |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **F1–F23** | Complete Ingestion, Annotation, Export & Theme Baselines | 115 | 115 | 12 | 5 | 247 |
| **TOTAL SUITE** | | **141** | **142** | **22** | **10** | **315** |

---

## 4. Test Suite Structure & Layout

```
tests/
├── setup.ts                                # Vitest test setup and JSDOM polyfills
├── helpers/
│   └── testFixtures.ts                     # Shared domain models, contracts, fixtures & reference oracles
└── e2e/
    ├── test-runner.ts                      # Standalone test runner, assertion engine & mock harness
    ├── r1-r5-tier1-features.test.ts        # R1-R5 Tier 1: Feature Coverage (>=5 per feature)
    ├── r1-r5-tier2-boundaries.test.ts      # R1-R5 Tier 2: Boundary & Corner Cases (>=5 per feature)
    ├── r1-r5-tier3-combinations.test.ts    # R1-R5 Tier 3: Pairwise Cross-Feature Interactions
    ├── r1-r5-tier4-workloads.test.ts       # R1-R5 Tier 4: Real-World Developer Workloads
    ├── tier1-features.test.ts              # Baseline Tier 1: Features 1 through 23
    ├── tier2-boundaries.test.ts            # Baseline Tier 2: Boundaries for Features 1 through 23
    ├── tier3-combinations.test.ts          # Baseline Tier 3: Cross-Feature Combinations
    └── tier4-workloads.test.ts             # Baseline Tier 4: End-to-End User Workloads
```

---

## 5. Execution Commands

```bash
# Execute the complete 4-tier master test suite (315 tests across 60 suites):
npx tsx tests/e2e/test-runner.ts

# Run individual enhancement test tiers:
npx tsx tests/e2e/r1-r5-tier1-features.test.ts
npx tsx tests/e2e/r1-r5-tier2-boundaries.test.ts
npx tsx tests/e2e/r1-r5-tier3-combinations.test.ts
npx tsx tests/e2e/r1-r5-tier4-workloads.test.ts

# Run Vitest test runner (unit, component, integration, and stress tests):
npm test
```

---

## 6. Authoritative Specifications & Invariant Contracts

### 6.1 R1: Image Paste Modes, Ghost Elimination & Layering
1. **Ghost Annotation Elimination**: When pasting over an active session and selecting "Replace & Clear Annotations" (`REPLACE_IMAGE_AND_CLEAR`), `state.annotations` and `state.overlays` must be strictly empty (`length === 0`). Zero residual annotations, badges, or note cards may persist.
2. **Replacement with Preservation**: Selecting "Replace & Keep Annotations" (`REPLACE_IMAGE_AND_KEEP`) swaps `state.image` while leaving all `state.annotations`, sequence badges, and markdown notes intact.
3. **Overlay Layering**: Selecting "Add as Layer / Overlay" (`ADD_IMAGE_OVERLAY`) appends an `ImageOverlay` record without altering `state.image` or resetting existing annotations.
4. **Style Retention Invariant**: Preserving annotations across image replacements must not mutate per-annotation styling (`color`, `strokeWidth`, `fillOpacity`).

### 6.2 R2: Wheel Zoom Preset Ladder Quantization & Focal Invariance
1. **Discrete Preset Scale**: Wheel zooming is quantized strictly across the 10-preset ladder:
   $$\text{ZOOM\_PRESETS} = [0.10, 0.25, 0.33, 0.50, 0.67, 0.75, 1.00, 1.25, 1.50, 2.00]$$
2. **Monotonic Step Transition**: A single wheel tick (`deltaY < 0` for zoom in, `deltaY > 0` for zoom out) advances or decrements by exactly one step index along the ladder. Trackpad delta bursts cannot leap across multiple tiers.
3. **Cursor Focal Point Invariance**: Zooming centered at screen cursor $(x_f, y_f)$ guarantees that the underlying image point remains identical before and after zoom:
   $$\mathbf{P}_s^{\text{focal}} = s_{\text{old}} \mathbf{P}_i^{\text{focal}} + \mathbf{T}_{\text{old}} = s_{\text{new}} \mathbf{P}_i^{\text{focal}} + \mathbf{T}_{\text{new}}$$

### 6.3 R3: Responsive Annotation Toolbar Layout
1. **Universal Tool Rendering**: At viewports down to $768\text{px}$ and $640\text{px}$, all drawing tools (Select, Box, Ellipse, Arrow, Pin, Pan) and styling controls must remain rendered and interactive.
2. **Clean Multi-Row Wrapping**: The toolbar container must wrap fluidly into multiple rows without clipping controls horizontally or hiding tools behind hidden overflow menus.

### 6.4 R4: Distinct Stroke Width Presets
1. **Options Scale**: Presets must offer $[2, 4, 8]\text{px}$ options with distinct visual line weights.
2. **Immediate Selection Application**: Clicking a stroke preset immediately updates the stroke width of any selected annotation and establishes the default for subsequently drawn shapes.

### 6.5 R5: Explicit Fill Opacity Controls
1. **Explicit Label**: Opacity controls feature a visible descriptive `"Fill"` label (`data-testid="fill-opacity-label"`).
2. **Presets Scale**: Provides $[0\%, 15\%, 30\%, 50\%]$ fill opacity presets.
3. **Immediate Selection Application & Active Indicator**: Selecting a preset updates the fill opacity of any selected annotation immediately and highlights the active preset button.
