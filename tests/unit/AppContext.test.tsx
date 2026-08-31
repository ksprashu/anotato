import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AppProvider, useApp } from '../../src/state/AppContext';
import { BoxGeometry } from '../../src/types';

describe('AppContext & React State Hook', () => {
  const sampleBox: BoxGeometry = {
    type: 'box',
    x: 10,
    y: 20,
    width: 100,
    height: 80,
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppProvider>{children}</AppProvider>
  );

  it('throws error when useApp is used outside of AppProvider', () => {
    // Suppress expected console error during hook error test
    const originalError = console.error;
    console.error = () => {};
    expect(() => renderHook(() => useApp())).toThrow(
      'useApp must be used within an AppProvider'
    );
    console.error = originalError;
  });

  it('provides initial state and allows adding annotations', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    expect(result.current.state.annotations).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.dispatch({
        type: 'ADD_ANNOTATION',
        payload: { geometry: sampleBox },
      });
    });

    expect(result.current.state.annotations).toHaveLength(1);
    expect(result.current.state.annotations[0].index).toBe(1);
    expect(result.current.canUndo).toBe(true);
  });

  it('handles undo and redo correctly through context helpers', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    act(() => {
      result.current.dispatch({
        type: 'ADD_ANNOTATION',
        payload: { id: 'box1', geometry: sampleBox },
      });
    });

    expect(result.current.state.annotations).toHaveLength(1);

    act(() => {
      result.current.undo();
    });

    expect(result.current.state.annotations).toHaveLength(0);
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.redo();
    });

    expect(result.current.state.annotations).toHaveLength(1);
    expect(result.current.state.annotations[0].id).toBe('box1');
  });

  it('supports drag/resize gesture commit via commitGesture', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    act(() => {
      result.current.dispatch({
        type: 'ADD_ANNOTATION',
        payload: { id: 'box1', geometry: sampleBox },
      });
    });

    const initialSnap = {
      annotations: result.current.state.annotations,
      selectedAnnotationId: result.current.state.selectedAnnotationId,
    };

    // Begin gesture
    act(() => {
      result.current.txManager.beginTransaction(initialSnap);
    });

    // Update geometry during drag
    act(() => {
      result.current.dispatch({
        type: 'UPDATE_ANNOTATION_GEOMETRY',
        payload: { id: 'box1', geometry: { ...sampleBox, x: 200 } },
      });
    });

    // Commit gesture on pointerup
    act(() => {
      result.current.commitGesture();
    });

    expect(result.current.state.annotations[0].geometry).toEqual({ ...sampleBox, x: 200 });

    // Undo should revert back to sampleBox at x=10
    act(() => {
      result.current.undo();
    });

    expect(result.current.state.annotations[0].geometry).toEqual(sampleBox);
  });
});
