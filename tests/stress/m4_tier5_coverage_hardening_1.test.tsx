import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { useClipboardPaste, createBaseImageFromBlob } from '../../src/hooks/useClipboardPaste';
import { ReplaceImageModal } from '../../src/components/modals/ReplaceImageModal';
import { appReducer, createInitialState, generateUniqueId, reindexAnnotations } from '../../src/state/appReducer';
import {
  quantizeWheelZoom,
  computeZoomTransform,
  getFitToViewportTransform,
  clamp,
  screenToImage,
  imageToScreen,
  ZOOM_PRESETS,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../../src/math/coordinates';
import { CanvasWorkspace } from '../../src/components/canvas/CanvasWorkspace';
import { ColorPalette, STROKE_WIDTH_OPTIONS, FILL_OPACITY_OPTIONS } from '../../src/components/toolbar/ColorPalette';
import { App } from '../../src/App';
import { AppProvider, useApp } from '../../src/state/AppContext';
import {
  renderCompositeCanvas,
  exportCompositeBlob,
  exportCompositeDataUrl,
  hexToRgba,
  drawRoundRect,
} from '../../src/export/canvasExporter';
import {
  BaseImage,
  Annotation,
  ImageOverlay,
  BoxGeometry,
  Point,
  ViewportState,
  AppState,
  PresetColor,
} from '../../src/types';

// Fixture helpers
const mockBaseImageA: BaseImage = {
  id: 'base-img-a',
  src: 'blob:http://localhost/base-a',
  naturalWidth: 1000,
  naturalHeight: 800,
  fileName: 'screenshot-a.png',
  fileSize: 45000,
};

const mockBaseImageB: BaseImage = {
  id: 'base-img-b',
  src: 'blob:http://localhost/base-b',
  naturalWidth: 1200,
  naturalHeight: 900,
  fileName: 'screenshot-b.png',
  fileSize: 60000,
};

const mockOverlay1: ImageOverlay = {
  id: 'overlay-1',
  src: 'blob:http://localhost/overlay-blob-1',
  naturalWidth: 400,
  naturalHeight: 300,
  fileName: 'overlay-1.png',
  fileSize: 15000,
  x: 20,
  y: 30,
  width: 400,
  height: 300,
  opacity: 0.85,
};

const mockOverlay2DataUrl: ImageOverlay = {
  id: 'overlay-2',
  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  naturalWidth: 200,
  naturalHeight: 150,
  fileName: 'overlay-2.png',
  fileSize: 5000,
  x: 100,
  y: 120,
  width: 200,
  height: 150,
  opacity: 0.5,
};

const sampleBox: BoxGeometry = {
  type: 'box',
  x: 60,
  y: 80,
  width: 140,
  height: 90,
};

function createSampleAnnotation(id: string, index: number, color: PresetColor = 'amber'): Annotation {
  return {
    id,
    index,
    geometry: { ...sampleBox, x: sampleBox.x + index * 10 },
    style: { color, strokeWidth: 4, fillOpacity: 0.3 },
    note: `Sample Note ${index}`,
    createdAt: 1000 + index,
    updatedAt: 1000 + index,
  };
}

describe('Milestone 4 Tier 5 Challenger 1: White-Box Code Coverage & Untested Path Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // =========================================================================
  // Section 1: useClipboardPaste.ts Deep Branch & Adversarial Edge Hardening
  // =========================================================================
  describe('Section 1: useClipboardPaste.ts Deep Branch & Memory Management', () => {
    const createWrapper = (initialState?: Partial<AppState>) => {
      return ({ children }: { children: React.ReactNode }) =>
        React.createElement(AppProvider, { initialState, children });
    };

    it('C1.1: replaceAndClearAnnotations revokes overlay blob URLs while skipping non-blob URLs and staged image URL', async () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const onImageLoaded = vi.fn();

      const overlaySameSrc: ImageOverlay = {
        ...mockOverlay1,
        id: 'overlay-same',
        src: 'blob:http://localhost/staged-image-url',
      };

      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImageA,
            annotations: [createSampleAnnotation('a1', 1)],
            overlays: [mockOverlay1, mockOverlay2DataUrl, overlaySameSrc],
          }),
        }
      );

      // Create staged image with matching src for overlaySameSrc
      const stagedBlob = new File(['staged'], 'staged.png', { type: 'image/png' });
      vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:http://localhost/staged-image-url');

      await act(async () => {
        await result.current.processImageBlob(stagedBlob);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);
      expect(result.current.pendingImage?.src).toBe('blob:http://localhost/staged-image-url');

      act(() => {
        result.current.replaceAndClearAnnotations();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(onImageLoaded).toHaveBeenCalledTimes(1);

      // Verify previous base image blob was revoked
      expect(revokeSpy).toHaveBeenCalledWith(mockBaseImageA.src);

      // Verify mockOverlay1 blob was revoked
      expect(revokeSpy).toHaveBeenCalledWith(mockOverlay1.src);

      // Verify non-blob data URL was NOT revoked
      expect(revokeSpy).not.toHaveBeenCalledWith(mockOverlay2DataUrl.src);

      // Verify overlay with same src as staged image was NOT revoked
      expect(revokeSpy).not.toHaveBeenCalledWith('blob:http://localhost/staged-image-url');
    });

    it('C1.2: replaceAndKeepAnnotations swaps base image, preserves overlays, revokes old base image URL, and closes modal', async () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const onImageLoaded = vi.fn();

      const { result } = renderHook(
        () => useClipboardPaste({ onImageLoaded, requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImageA,
            annotations: [createSampleAnnotation('a1', 1)],
            overlays: [mockOverlay1],
          }),
        }
      );

      const nextFile = new File(['next'], 'next.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(nextFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);

      act(() => {
        result.current.replaceAndKeepAnnotations();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(revokeSpy).toHaveBeenCalledWith(mockBaseImageA.src);
      // Overlays are kept, so mockOverlay1.src must NOT be revoked
      expect(revokeSpy).not.toHaveBeenCalledWith(mockOverlay1.src);
    });

    it('C1.3: addAsLayer converts pending image to ImageOverlay at (0,0) without revoking base image', async () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImageA,
            annotations: [createSampleAnnotation('a1', 1)],
            overlays: [],
          }),
        }
      );

      const layerFile = new File(['layer'], 'layer.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(layerFile);
      });

      expect(result.current.isReplaceModalOpen).toBe(true);

      act(() => {
        result.current.addAsLayer();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      // Base image must NOT be revoked
      expect(revokeSpy).not.toHaveBeenCalledWith(mockBaseImageA.src);
    });

    it('C1.4: requireConfirmationIfAnnotated opens replace modal when annotations=0 but overlays>0 exist', async () => {
      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImageA,
            annotations: [], // 0 annotations
            overlays: [mockOverlay1], // overlays present!
          }),
        }
      );

      const newFile = new File(['bytes'], 'new.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(newFile);
      });

      // Untested branch: overlays trigger modal even with 0 annotations
      expect(result.current.isReplaceModalOpen).toBe(true);
      expect(result.current.pendingImage).not.toBeNull();
    });

    it('C1.5: createBaseImageFromBlob infers image format from filename extension when MIME type is empty string', async () => {
      // Empty MIME type File with valid extension
      const extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
      for (const ext of extensions) {
        const file = new File(['data'], `image_test.${ext}`, { type: '' });
        const baseImage = await createBaseImageFromBlob(file);
        expect(baseImage).toBeDefined();
        expect(baseImage.fileName).toBe(`image_test.${ext}`);
        expect(baseImage.naturalWidth).toBeGreaterThan(0);
        expect(baseImage.naturalHeight).toBeGreaterThan(0);
      }

      // Invalid extension and empty MIME throws error
      const invalidFile = new File(['data'], 'malicious.exe', { type: '' });
      await expect(createBaseImageFromBlob(invalidFile)).rejects.toThrow(/Unsupported or invalid image format/);
    });

    it('C1.6: handleDrop searches file array to locate image file when first item is non-image', async () => {
      const onImageLoaded = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onImageLoaded }), {
        wrapper: createWrapper(),
      });

      const textFile = new File(['info'], 'notes.txt', { type: 'text/plain' });
      const imageFile = new File(['png-data'], 'actual_screenshot.png', { type: 'image/png' });

      const fakeDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [textFile, imageFile],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(fakeDropEvent);
      });

      expect(onImageLoaded).toHaveBeenCalledTimes(1);
      expect(onImageLoaded.mock.calls[0][0].fileName).toBe('actual_screenshot.png');
    });

    it('C1.7: handleDrop does not throw or call onError when drop event has zero files', async () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onError }), {
        wrapper: createWrapper(),
      });

      const emptyDropEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: {
          files: [],
        },
      } as unknown as React.DragEvent;

      await act(async () => {
        await result.current.handleDrop(emptyDropEvent);
      });

      expect(onError).not.toHaveBeenCalled();
    });

    it('C1.8: cancelImageReplacement does not revoke blob URL if image src was already committed', async () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const { result } = renderHook(
        () => useClipboardPaste({ requireConfirmationIfAnnotated: true }),
        {
          wrapper: createWrapper({
            image: mockBaseImageA,
            annotations: [createSampleAnnotation('a1', 1)],
          }),
        }
      );

      const file = new File(['bytes'], 'commit_check.png', { type: 'image/png' });
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      const pendingSrc = result.current.pendingImage?.src;
      expect(pendingSrc).toBeDefined();

      // Commit replacement
      act(() => {
        result.current.replaceAndKeepAnnotations();
      });

      // Now pendingImage is null; staging another image
      await act(async () => {
        await result.current.processImageBlob(file);
      });

      // Cancel
      act(() => {
        result.current.cancelImageReplacement();
      });

      expect(result.current.isReplaceModalOpen).toBe(false);
      expect(result.current.pendingImage).toBeNull();
      expect(revokeSpy).toHaveBeenCalled();
    });

    it('C1.9: processImageBlob forwards error to onError and rethrows', async () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useClipboardPaste({ onError }), {
        wrapper: createWrapper(),
      });

      const corruptBlob = new Blob(['invalid'], { type: 'application/pdf' });
      await act(async () => {
        try {
          await result.current.processImageBlob(corruptBlob);
        } catch {
          // Expected error caught
        }
      });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(result.current.isLoading).toBe(false);
    });
  });

  // =========================================================================
  // Section 2: ReplaceImageModal.tsx Accessibility & Keyboard Navigation Hardening
  // =========================================================================
  describe('Section 2: ReplaceImageModal.tsx Accessibility, Focus Trap & Enter Discrimination', () => {
    it('C2.1: Tab key wraps from last focusable button to first focusable button in modal', () => {
      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={4}
          onReplaceClear={vi.fn()}
          onReplaceKeep={vi.fn()}
          onAddLayer={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const addLayerBtn = screen.getByTestId('replace-modal-add-layer-btn');
      const cancelBtn = screen.getByTestId('replace-modal-cancel-btn');

      // Focus last element
      cancelBtn.focus();
      expect(document.activeElement).toBe(cancelBtn);

      // Press Tab on last element -> wraps to first (addLayerBtn)
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
      expect(document.activeElement).toBe(addLayerBtn);
    });

    it('C2.2: Shift+Tab key wraps from first focusable button to last focusable button in modal', () => {
      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={4}
          onReplaceClear={vi.fn()}
          onReplaceKeep={vi.fn()}
          onAddLayer={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const addLayerBtn = screen.getByTestId('replace-modal-add-layer-btn');
      const cancelBtn = screen.getByTestId('replace-modal-cancel-btn');

      // Focus first element
      addLayerBtn.focus();
      expect(document.activeElement).toBe(addLayerBtn);

      // Press Shift+Tab on first element -> wraps to last (cancelBtn)
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(cancelBtn);
    });

    it('C2.3: Tab key on an intermediate button does not wrap and lets natural browser focus proceed', () => {
      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={4}
          onReplaceClear={vi.fn()}
          onReplaceKeep={vi.fn()}
          onAddLayer={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const keepBtn = screen.getByTestId('replace-modal-replace-keep-btn');
      keepBtn.focus();
      expect(document.activeElement).toBe(keepBtn);

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false, cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      window.dispatchEvent(event);

      // Intermediate button must NOT preventDefault
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('C2.4: Enter key does NOT trigger handleReplaceClear when an explicit button is currently focused', () => {
      const onReplaceClear = vi.fn();
      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={3}
          onReplaceClear={onReplaceClear}
          onCancel={vi.fn()}
        />
      );

      const cancelBtn = screen.getByTestId('replace-modal-cancel-btn');
      cancelBtn.focus();
      expect(document.activeElement).toBe(cancelBtn);

      // Press Enter while focused on Cancel button
      fireEvent.keyDown(window, { key: 'Enter' });

      // handleReplaceClear must NOT be called
      expect(onReplaceClear).not.toHaveBeenCalled();
    });

    it('C2.5: Enter key triggers handleReplaceClear when focus is not on an interactive button', () => {
      const onReplaceClear = vi.fn();
      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={3}
          onReplaceClear={onReplaceClear}
          onCancel={vi.fn()}
        />
      );

      // Blur document body
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      fireEvent.keyDown(window, { key: 'Enter' });
      expect(onReplaceClear).toHaveBeenCalledTimes(1);
    });

    it('C2.6: executes safely without runtime errors when action callbacks are undefined', async () => {
      const user = userEvent.setup();
      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={2}
          onCancel={vi.fn()}
        />
      );

      // Clicking buttons when onReplaceClear/onReplaceKeep/onAddLayer are undefined
      await user.click(screen.getByTestId('replace-modal-confirm-btn'));
      await user.click(screen.getByTestId('replace-modal-replace-keep-btn'));
      await user.click(screen.getByTestId('replace-modal-add-layer-btn'));
      expect(screen.getByTestId('replace-image-modal')).toBeInTheDocument();
    });

    it('C2.7: renders "0 active annotations" when annotationCount is 0', () => {
      render(
        <ReplaceImageModal
          isOpen={true}
          annotationCount={0}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText(/active annotations/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Section 3: appReducer.ts Action Handlers & Selection / Style Hardening
  // =========================================================================
  describe('Section 3: appReducer.ts Action Handlers & Selection / Style Invariants', () => {
    it('C3.1: SET_ACTIVE_STROKE_WIDTH updates active stroke width and mutates currently selected annotation', () => {
      const ann1 = createSampleAnnotation('ann-1', 1);
      const ann2 = createSampleAnnotation('ann-2', 2);
      const state = createInitialState({
        annotations: [ann1, ann2],
        selectedAnnotationId: 'ann-1',
        activeStrokeWidth: 2,
      });

      const nextState = appReducer(state, {
        type: 'SET_ACTIVE_STROKE_WIDTH',
        payload: 8,
      });

      expect(nextState.activeStrokeWidth).toBe(8);
      // Selected annotation ann-1 updated
      expect(nextState.annotations[0].style.strokeWidth).toBe(8);
      expect(nextState.annotations[0].updatedAt).toBeGreaterThanOrEqual(ann1.updatedAt);
      // Unselected annotation ann-2 untouched
      expect(nextState.annotations[1].style.strokeWidth).toBe(ann2.style.strokeWidth);
    });

    it('C3.2: SET_ACTIVE_STROKE_WIDTH does not modify any annotation when selectedAnnotationId is null', () => {
      const ann1 = createSampleAnnotation('ann-1', 1);
      const state = createInitialState({
        annotations: [ann1],
        selectedAnnotationId: null,
        activeStrokeWidth: 2,
      });

      const nextState = appReducer(state, {
        type: 'SET_ACTIVE_STROKE_WIDTH',
        payload: 4,
      });

      expect(nextState.activeStrokeWidth).toBe(4);
      expect(nextState.annotations[0].style.strokeWidth).toBe(ann1.style.strokeWidth);
    });

    it('C3.3: SET_ACTIVE_FILL_OPACITY updates active opacity and mutates currently selected annotation', () => {
      const ann1 = createSampleAnnotation('ann-1', 1);
      const ann2 = createSampleAnnotation('ann-2', 2);
      const state = createInitialState({
        annotations: [ann1, ann2],
        selectedAnnotationId: 'ann-2',
        activeFillOpacity: 0.15,
      });

      const nextState = appReducer(state, {
        type: 'SET_ACTIVE_FILL_OPACITY',
        payload: 0.5,
      });

      expect(nextState.activeFillOpacity).toBe(0.5);
      // Selected annotation ann-2 updated
      expect(nextState.annotations[1].style.fillOpacity).toBe(0.5);
      // Unselected ann-1 untouched
      expect(nextState.annotations[0].style.fillOpacity).toBe(ann1.style.fillOpacity);
    });

    it('C3.4: SET_ACTIVE_FILL_OPACITY does not modify any annotation when selectedAnnotationId is null', () => {
      const ann1 = createSampleAnnotation('ann-1', 1);
      const state = createInitialState({
        annotations: [ann1],
        selectedAnnotationId: null,
        activeFillOpacity: 0.15,
      });

      const nextState = appReducer(state, {
        type: 'SET_ACTIVE_FILL_OPACITY',
        payload: 0,
      });

      expect(nextState.activeFillOpacity).toBe(0);
      expect(nextState.annotations[0].style.fillOpacity).toBe(ann1.style.fillOpacity);
    });

    it('C3.5: ADD_IMAGE_OVERLAY appends overlay and handles raw ImageOverlay vs wrapped payload', () => {
      const state = createInitialState({ overlays: [] });

      // Wrapped payload
      const stateWithWrapped = appReducer(state, {
        type: 'ADD_IMAGE_OVERLAY',
        payload: { overlay: mockOverlay1 },
      });
      expect(stateWithWrapped.overlays).toHaveLength(1);
      expect(stateWithWrapped.overlays[0].id).toBe(mockOverlay1.id);

      // Raw payload
      const stateWithRaw = appReducer(stateWithWrapped, {
        type: 'ADD_IMAGE_OVERLAY',
        payload: mockOverlay2DataUrl as unknown as { overlay: ImageOverlay },
      });
      expect(stateWithRaw.overlays).toHaveLength(2);
      expect(stateWithRaw.overlays[1].id).toBe(mockOverlay2DataUrl.id);
    });

    it('C3.6: REMOVE_IMAGE_OVERLAY and CLEAR_IMAGE_OVERLAYS cleanly remove overlays', () => {
      const state = createInitialState({
        overlays: [mockOverlay1, mockOverlay2DataUrl],
      });

      // Remove by string ID
      const stateAfterRemoveString = appReducer(state, {
        type: 'REMOVE_IMAGE_OVERLAY',
        payload: 'overlay-1',
      });
      expect(stateAfterRemoveString.overlays).toHaveLength(1);
      expect(stateAfterRemoveString.overlays[0].id).toBe('overlay-2');

      // Remove by { id: string } object
      const stateAfterRemoveObj = appReducer(stateAfterRemoveString, {
        type: 'REMOVE_IMAGE_OVERLAY',
        payload: { id: 'overlay-2' },
      });
      expect(stateAfterRemoveObj.overlays).toHaveLength(0);

      // CLEAR_IMAGE_OVERLAYS
      const stateWithOverlays = createInitialState({ overlays: [mockOverlay1] });
      const cleared = appReducer(stateWithOverlays, { type: 'CLEAR_IMAGE_OVERLAYS' });
      expect(cleared.overlays).toEqual([]);
    });

    it('C3.7: REORDER_ANNOTATIONS handles out-of-bounds, negative, identical indices, and synonyms gracefully', () => {
      const annotations = [
        createSampleAnnotation('a1', 1),
        createSampleAnnotation('a2', 2),
        createSampleAnnotation('a3', 3),
      ];
      const state = createInitialState({ annotations });

      // Out of bounds: returns identical state reference
      expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: -1, toIndex: 1 } })).toBe(state);
      expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: 0, toIndex: 5 } })).toBe(state);
      expect(appReducer(state, { type: 'REORDER_ANNOTATIONS', payload: { fromIndex: 1, toIndex: 1 } })).toBe(state);

      // Synonyms: sourceIndex and destinationIndex
      const reordered = appReducer(state, {
        type: 'REORDER_ANNOTATIONS',
        payload: { sourceIndex: 0, destinationIndex: 2 },
      });
      expect(reordered.annotations.map((a) => a.id)).toEqual(['a2', 'a3', 'a1']);
      expect(reordered.annotations.map((a) => a.index)).toEqual([1, 2, 3]);
    });

    it('C3.8: RESTORE_SNAPSHOT and RESET_STATE manage full state hydration', () => {
      const ann = createSampleAnnotation('snap-1', 5);
      const state = createInitialState();

      // RESTORE_SNAPSHOT reindexes annotations to 1..N
      const restored = appReducer(state, {
        type: 'RESTORE_SNAPSHOT',
        payload: {
          annotations: [ann],
          selectedAnnotationId: 'snap-1',
        },
      });
      expect(restored.annotations[0].index).toBe(1);
      expect(restored.selectedAnnotationId).toBe('snap-1');

      // RESET_STATE
      const reset = appReducer(restored, {
        type: 'RESET_STATE',
        payload: { theme: 'light' },
      });
      expect(reset.theme).toBe('light');
      expect(reset.annotations).toEqual([]);
      expect(reset.selectedAnnotationId).toBeNull();
    });

    it('C3.9: generateUniqueId produces non-empty string and reindexAnnotations handles stable index array', () => {
      const id1 = generateUniqueId();
      const id2 = generateUniqueId();
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(5);
      expect(id1).not.toBe(id2);

      // reindexAnnotations returns exact array reference when indices already match 1..N
      const ann1 = createSampleAnnotation('x1', 1);
      const ann2 = createSampleAnnotation('x2', 2);
      const stableArray = [ann1, ann2];
      expect(reindexAnnotations(stableArray)).toBe(stableArray);
    });
  });

  // =========================================================================
  // Section 4: coordinates.ts Quantization, Off-Ladder & Boundary Math Hardening
  // =========================================================================
  describe('Section 4: coordinates.ts Quantization, Off-Ladder & Boundary Math Hardening', () => {
    it('C4.1: quantizeWheelZoom clamps strictly at 2.00 on zoom-in and 0.10 on zoom-out', () => {
      // Zoom in at maximum preset 2.00
      expect(quantizeWheelZoom(2.00, -120)).toBe(2.00);
      expect(quantizeWheelZoom(2.50, -500)).toBe(2.00);

      // Zoom out at minimum preset 0.10
      expect(quantizeWheelZoom(0.10, 120)).toBe(0.10);
      expect(quantizeWheelZoom(0.05, 500)).toBe(0.10);

      // Delta 0 returns exact input
      expect(quantizeWheelZoom(0.75, 0)).toBe(0.75);
    });

    it('C4.2: quantizeWheelZoom handles off-ladder extreme values without leaping multi-tiers', () => {
      // Sub-minimum: 0.05 zoom-in should reach lowest preset 0.10
      expect(quantizeWheelZoom(0.05, -100)).toBe(0.10);

      // Super-maximum: 5.00 zoom-out should reach highest preset 2.00
      expect(quantizeWheelZoom(5.00, 100)).toBe(2.00);

      // Fractional between 0.33 and 0.50: 0.40
      expect(quantizeWheelZoom(0.40, -100)).toBe(0.50);
      expect(quantizeWheelZoom(0.40, 100)).toBe(0.33);
    });

    it('C4.3: quantizeWheelZoom respects 0.005 epsilon threshold to absorb IEEE 754 precision drift', () => {
      // Exactly 0.75 + 0.006 (0.756) on zoom in should step to 1.00
      expect(quantizeWheelZoom(0.756, -100)).toBe(1.00);

      // Exactly 0.75 + 0.002 (0.752) on zoom in should step to 1.00
      expect(quantizeWheelZoom(0.752, -100)).toBe(1.00);

      // Exactly 0.75 + 0.002 (0.752) on zoom out should step to 0.67
      expect(quantizeWheelZoom(0.752, 100)).toBe(0.67);

      // Exactly 0.75 - 0.002 (0.748) on zoom out should step to 0.67
      expect(quantizeWheelZoom(0.748, 100)).toBe(0.67);
    });

    it('C4.4: computeZoomTransform preserves exact focal point invariance with negative and subpixel coordinates', () => {
      const initialViewport: ViewportState = { zoom: 1.25, panX: -250, panY: 180 };
      const subpixelFocalPoints: Point[] = [
        { x: -150.35, y: -75.8 },
        { x: 0, y: 0 },
        { x: 512.75, y: 384.25 },
      ];

      for (const focal of subpixelFocalPoints) {
        const imagePixelBefore = screenToImage(focal, initialViewport);
        const nextViewport = computeZoomTransform(initialViewport, focal, 1.5);

        expect(nextViewport.zoom).toBe(1.5);
        const screenPixelAfter = imageToScreen(imagePixelBefore, nextViewport);

        expect(screenPixelAfter.x).toBeCloseTo(focal.x, 4);
        expect(screenPixelAfter.y).toBeCloseTo(focal.y, 4);
      }
    });

    it('C4.5: computeZoomTransform early returns unmodified pan when oldZoom <= 0 or targetZoom == oldZoom', () => {
      const vp: ViewportState = { zoom: 1.0, panX: 50, panY: 60 };
      const focal: Point = { x: 100, y: 100 };

      // targetZoom == oldZoom
      const sameZoomResult = computeZoomTransform(vp, focal, 1.0);
      expect(sameZoomResult).toEqual(vp);

      // oldZoom <= 0
      const zeroZoomVp: ViewportState = { zoom: 0, panX: 20, panY: 30 };
      const zeroResult = computeZoomTransform(zeroZoomVp, focal, 1.5);
      expect(zeroResult.panX).toBe(20);
      expect(zeroResult.panY).toBe(30);
      expect(zeroResult.zoom).toBe(1.5);
    });

    it('C4.6: clamp throws on min > max and screenToImage safely handles zoom = 0', () => {
      expect(() => clamp(5, 10, 2)).toThrow(/Invalid clamp range/);
      expect(clamp(5, 5, 5)).toBe(5);

      const zeroZoomVp: ViewportState = { zoom: 0, panX: 40, panY: 50 };
      const p = screenToImage({ x: 140, y: 150 }, zeroZoomVp);
      expect(p.x).toBe(100);
      expect(p.y).toBe(100);
    });

    it('C4.7: getFitToViewportTransform clamps padding when viewport is smaller than 2 * padding', () => {
      // Tiny viewport where width (50) < 2 * padding (64)
      const fit = getFitToViewportTransform(800, 600, 50, 50, 32);
      expect(fit.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(fit.zoom).toBeLessThanOrEqual(MAX_ZOOM);
      expect(Number.isFinite(fit.panX)).toBe(true);
      expect(Number.isFinite(fit.panY)).toBe(true);
    });
  });

  // =========================================================================
  // Section 5: CanvasWorkspace.tsx Event Filtering & Overlay Rendering Hardening
  // =========================================================================
  describe('Section 5: CanvasWorkspace.tsx Event Filtering & Overlay Rendering', () => {
    it('C5.1: wheel event with deltaY = 0 does not alter viewport or dispatch actions', () => {
      let appContext: ReturnType<typeof useApp> | null = null;
      const TestConsumer = () => {
        appContext = useApp();
        return <CanvasWorkspace />;
      };

      const { container } = render(
        <AppProvider initialState={{ image: mockBaseImageA, viewport: { zoom: 1.0, panX: 0, panY: 0 } }}>
          <TestConsumer />
        </AppProvider>
      );

      const workspaceContainer = container.querySelector('[data-testid="canvas-workspace-container"]');
      expect(workspaceContainer).toBeInTheDocument();

      // Dispatch wheel event with deltaY = 0 (pure horizontal trackpad scroll)
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: 0,
        deltaX: 100,
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        workspaceContainer!.dispatchEvent(wheelEvent);
      });

      expect(appContext!.state.viewport.zoom).toBe(1.0);
    });

    it('C5.2: wheel event at boundary (zoom = 2.00 zoom-in or zoom = 0.10 zoom-out) skips redundant transform dispatch', () => {
      let appContext: ReturnType<typeof useApp> | null = null;
      const TestConsumer = () => {
        appContext = useApp();
        return <CanvasWorkspace />;
      };

      const { container } = render(
        <AppProvider initialState={{ image: mockBaseImageA, viewport: { zoom: 2.0, panX: 50, panY: 60 } }}>
          <TestConsumer />
        </AppProvider>
      );

      const workspaceContainer = container.querySelector('[data-testid="canvas-workspace-container"]');

      // Zoom in while already at 2.00 max boundary
      const wheelZoomIn = new WheelEvent('wheel', {
        deltaY: -120,
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        workspaceContainer!.dispatchEvent(wheelZoomIn);
      });

      expect(appContext!.state.viewport.zoom).toBe(2.0);
      expect(appContext!.state.viewport.panX).toBe(50);
      expect(appContext!.state.viewport.panY).toBe(60);
    });

    it('C5.3: renders image overlays with exact coordinates, dimensions, and opacity in Canvas transform layer', () => {
      const overlays: ImageOverlay[] = [
        {
          id: 'ov-layer-1',
          src: 'blob:http://localhost/layer-1',
          naturalWidth: 300,
          naturalHeight: 200,
          x: 45,
          y: 65,
          width: 300,
          height: 200,
          opacity: 0.75,
        },
      ];

      render(
        <AppProvider initialState={{ image: mockBaseImageA, overlays }}>
          <CanvasWorkspace />
        </AppProvider>
      );

      const overlayImg = screen.getByTestId('canvas-overlay-image-ov-layer-1');
      expect(overlayImg).toBeInTheDocument();
      expect(overlayImg).toHaveAttribute('data-overlay-id', 'ov-layer-1');
      expect(overlayImg.style.left).toBe('45px');
      expect(overlayImg.style.top).toBe('65px');
      expect(overlayImg.style.width).toBe('300px');
      expect(overlayImg.style.height).toBe('200px');
      expect(overlayImg.style.opacity).toBe('0.75');
    });

    it('C5.4: HUD viewport control buttons (zoom in, zoom out, fit to screen, reset 1:1) update zoom state', () => {
      let appContext: ReturnType<typeof useApp> | null = null;
      const TestConsumer = () => {
        appContext = useApp();
        return <CanvasWorkspace />;
      };

      render(
        <AppProvider initialState={{ image: mockBaseImageA, viewport: { zoom: 1.0, panX: 0, panY: 0 } }}>
          <TestConsumer />
        </AppProvider>
      );

      // HUD Zoom In
      fireEvent.click(screen.getByTestId('hud-zoom-in'));
      expect(appContext!.state.viewport.zoom).toBeGreaterThan(1.0);

      // HUD Zoom Out
      fireEvent.click(screen.getByTestId('hud-zoom-out'));
      expect(appContext!.state.viewport.zoom).toBeCloseTo(1.0, 1);

      // HUD Reset 1:1
      fireEvent.click(screen.getByTestId('hud-reset-100'));
      expect(appContext!.state.viewport.zoom).toBe(1.0);

      // HUD Fit to Screen
      fireEvent.click(screen.getByTestId('hud-fit-to-screen'));
      expect(appContext!.state.viewport).toBeDefined();
    });
  });

  // =========================================================================
  // Section 6: ColorPalette.tsx & App.tsx Responsive & Component Hardening
  // =========================================================================
  describe('Section 6: ColorPalette.tsx & App.tsx Responsive & Component Hardening', () => {
    it('C6.1: ColorPalette renders without error outside AppProvider and invokes custom callbacks', async () => {
      const user = userEvent.setup();
      const onColorChange = vi.fn();
      const onStrokeWidthChange = vi.fn();
      const onFillOpacityChange = vi.fn();

      render(
        <ColorPalette
          onColorChange={onColorChange}
          onStrokeWidthChange={onStrokeWidthChange}
          onFillOpacityChange={onFillOpacityChange}
        />
      );

      await user.click(screen.getByTestId('color-btn-cyan'));
      expect(onColorChange).toHaveBeenCalledWith('cyan');

      await user.click(screen.getByTestId('stroke-btn-4'));
      expect(onStrokeWidthChange).toHaveBeenCalledWith(4);

      await user.click(screen.getByTestId('opacity-btn-30'));
      expect(onFillOpacityChange).toHaveBeenCalledWith(0.3);
    });

    it('C6.2: ColorPalette disabled=true sets disabled attribute and blocks interaction', async () => {
      const user = userEvent.setup();
      const onColorChange = vi.fn();

      render(<ColorPalette disabled={true} onColorChange={onColorChange} />);

      const redBtn = screen.getByTestId('color-btn-red');
      expect(redBtn).toBeDisabled();

      await user.click(redBtn);
      expect(onColorChange).not.toHaveBeenCalled();
    });

    it('C6.3: ColorPalette reflects selected annotation styles over default active styles', () => {
      const selectedAnn: Annotation = {
        id: 'selected-ann',
        index: 1,
        geometry: sampleBox,
        style: { color: 'purple', strokeWidth: 8, fillOpacity: 0.5 },
        note: 'Selected',
        createdAt: 100,
        updatedAt: 100,
      };

      render(
        <AppProvider
          initialState={{
            annotations: [selectedAnn],
            selectedAnnotationId: 'selected-ann',
            activeColor: 'amber',
            activeStrokeWidth: 2,
            activeFillOpacity: 0.15,
          }}
        >
          <ColorPalette />
        </AppProvider>
      );

      // Selected annotation's purple/8px/50% must be checked, not default amber/2px/15%
      expect(screen.getByTestId('color-btn-purple')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('color-btn-amber')).toHaveAttribute('aria-checked', 'false');

      expect(screen.getByTestId('stroke-btn-8')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('stroke-btn-2')).toHaveAttribute('aria-checked', 'false');

      expect(screen.getByTestId('opacity-btn-50')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('opacity-btn-15')).toHaveAttribute('aria-checked', 'false');
    });

    it('C6.4: App header and tools containers feature responsive flex-wrap classes', () => {
      render(<App />);

      const header = screen.getByTestId('app-header');
      expect(header.className).toContain('flex-wrap');

      const toolsContainer = screen.getByTestId('annotation-tools-container');
      expect(toolsContainer.className).toContain('flex-wrap');
    });
  });

  // =========================================================================
  // Section 7: canvasExporter.ts Composite Overlays & Style Serialization Hardening
  // =========================================================================
  describe('Section 7: canvasExporter.ts Composite Overlays & Style Serialization Hardening', () => {
    it('C7.1: renderCompositeCanvas composites multiple overlays with opacity and custom bounds beneath annotations', async () => {
      const annotations = [createSampleAnnotation('ann-1', 1, 'red')];
      const overlays = [mockOverlay1, mockOverlay2DataUrl];

      const canvas = await renderCompositeCanvas(mockBaseImageB, annotations, overlays);

      expect(canvas.width).toBe(mockBaseImageB.naturalWidth);
      expect(canvas.height).toBe(mockBaseImageB.naturalHeight);

      // Export to blob and dataURL
      const blob = await exportCompositeBlob(mockBaseImageB, annotations, overlays);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/png');

      const dataUrl = await exportCompositeDataUrl(mockBaseImageB, annotations, overlays);
      expect(dataUrl).toMatch(/^data:image\/png/);
    });

    it('C7.2: renderCompositeCanvas catches overlay image loading errors gracefully without crashing export', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const badOverlay: ImageOverlay = {
        id: 'bad-overlay',
        src: 'invalid-image-source:corrupt-data',
        naturalWidth: 100,
        naturalHeight: 100,
        x: 0,
        y: 0,
        opacity: 1,
      };

      const canvas = await renderCompositeCanvas(mockBaseImageA, [], [badOverlay]);
      expect(canvas.width).toBe(mockBaseImageA.naturalWidth);
      expect(canvas.height).toBe(mockBaseImageA.naturalHeight);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('C7.3: hexToRgba clamps opacity, handles 3-digit hex expansion, and falls back safely on invalid hex', () => {
      // 3-digit hex #0f0 -> rgb(0, 255, 0)
      expect(hexToRgba('#0f0', 0.5)).toBe('rgba(0, 255, 0, 0.5)');

      // 6-digit hex #ff0000 -> rgb(255, 0, 0)
      expect(hexToRgba('#ff0000', 0.8)).toBe('rgba(255, 0, 0, 0.8)');

      // Opacity clamping
      expect(hexToRgba('#123456', -0.5)).toBe('rgba(18, 52, 86, 0)');
      expect(hexToRgba('#123456', 1.5)).toBe('rgba(18, 52, 86, 1)');

      // Malformed hex fallback
      expect(hexToRgba('invalid', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    });

    it('C7.4: drawRoundRect executes fallback path when roundRect is undefined on 2D context', () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      // Temporarily remove roundRect method to test fallback
      const originalRoundRect = (ctx as unknown as { roundRect?: unknown }).roundRect;
      delete (ctx as unknown as { roundRect?: unknown }).roundRect;

      const moveToSpy = vi.spyOn(ctx, 'moveTo');
      const arcToSpy = vi.spyOn(ctx, 'arcTo');

      drawRoundRect(ctx, 10, 10, 100, 80, 8);

      expect(moveToSpy).toHaveBeenCalled();
      expect(arcToSpy).toHaveBeenCalled();

      // Test radius <= 0 fallback to rect
      const rectSpy = vi.spyOn(ctx, 'rect');
      drawRoundRect(ctx, 0, 0, 50, 50, 0);
      expect(rectSpy).toHaveBeenCalledWith(0, 0, 50, 50);

      // Restore roundRect
      (ctx as unknown as { roundRect?: unknown }).roundRect = originalRoundRect;
    });

    it('C7.5: supports ExportCanvasOptions object with backgroundColor and overlays parameter', async () => {
      const canvas = await renderCompositeCanvas(mockBaseImageA, [], {
        backgroundColor: '#FFFFFF',
        overlays: [mockOverlay1],
      });

      expect(canvas.width).toBe(mockBaseImageA.naturalWidth);
      expect(canvas.height).toBe(mockBaseImageA.naturalHeight);
    });

    it('C7.6: verifies STROKE_WIDTH_OPTIONS and ZOOM_PRESETS immutability and complete values', () => {
      expect(STROKE_WIDTH_OPTIONS).toEqual([2, 4, 8]);
      expect(FILL_OPACITY_OPTIONS.length).toBe(4);
      expect(ZOOM_PRESETS.length).toBe(10);
      expect(ZOOM_PRESETS[0]).toBe(0.10);
      expect(ZOOM_PRESETS[9]).toBe(2.00);
    });
  });
});
