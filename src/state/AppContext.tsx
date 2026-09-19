import React, { createContext, useContext, useReducer, useRef, useCallback, useEffect } from 'react';
import { AppState, AppAction, HistoryState, HistorySnapshot } from '../types';
import { appReducer, createInitialState } from './appReducer';
import {
  createInitialHistory,
  pushHistory,
  undo as historyUndo,
  redo as historyRedo,
  resetHistory,
  canUndo as checkCanUndo,
  canRedo as checkCanRedo,
  TransactionManager,
} from './historyManager';

export interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  history: HistoryState;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  resetHistory: (snapshot?: HistorySnapshot) => void;
  txManager: TransactionManager;
  commitGesture: (finalSnapshot?: HistorySnapshot) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export interface AppProviderProps {
  children?: React.ReactNode;
  initialState?: Partial<AppState>;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, initialState }) => {
  const [state, rawDispatch] = useReducer(
    appReducer,
    initialState,
    (init) => createInitialState(init)
  );

  const txManagerRef = useRef<TransactionManager>(new TransactionManager());
  const [history, setHistory] = useReducer(
    (current: HistoryState, action: { type: 'PUSH'; snapshot: HistorySnapshot } | { type: 'UNDO' } | { type: 'REDO' } | { type: 'RESET'; snapshot: HistorySnapshot } | { type: 'COMMIT_TX'; finalSnapshot: HistorySnapshot }) => {
      switch (action.type) {
        case 'PUSH':
          return pushHistory(current, action.snapshot);
        case 'UNDO':
          return historyUndo(current);
        case 'REDO':
          return historyRedo(current);
        case 'RESET':
          return resetHistory(action.snapshot);
        case 'COMMIT_TX':
          return txManagerRef.current.commitTransaction(current, action.finalSnapshot);
        default:
          return current;
      }
    },
    undefined,
    () => createInitialHistory(state.annotations, state.selectedAnnotationId)
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  // Synchronize history on structural state changes if not in active transaction
  const lastSnapshotRef = useRef<HistorySnapshot>({
    annotations: state.annotations,
    selectedAnnotationId: state.selectedAnnotationId,
  });

  const dispatch = useCallback((action: AppAction) => {
    rawDispatch(action);

    // When base image is replaced or cleared, reset history stack
    // so Undo (Cmd+Z) cannot resuscitate stale annotations from previous images
    if (
      action.type === 'REPLACE_IMAGE_AND_CLEAR' ||
      action.type === 'CLEAR_IMAGE' ||
      action.type === 'SET_IMAGE'
    ) {
      const emptySnapshot: HistorySnapshot = {
        annotations: [],
        selectedAnnotationId: null,
      };
      setHistory({ type: 'RESET', snapshot: emptySnapshot });
      lastSnapshotRef.current = emptySnapshot;
    } else if (action.type === 'REPLACE_IMAGE_AND_KEEP') {
      const keepSnapshot: HistorySnapshot = {
        annotations: stateRef.current.annotations,
        selectedAnnotationId: null,
      };
      setHistory({ type: 'RESET', snapshot: keepSnapshot });
      lastSnapshotRef.current = keepSnapshot;
    }
  }, []);

  const resetHistoryCallback = useCallback((snapshot?: HistorySnapshot) => {
    const snap = snapshot ?? {
      annotations: stateRef.current.annotations,
      selectedAnnotationId: stateRef.current.selectedAnnotationId,
    };
    setHistory({ type: 'RESET', snapshot: snap });
    lastSnapshotRef.current = snap;
  }, []);

  useEffect(() => {
    const currentSnapshot: HistorySnapshot = {
      annotations: state.annotations,
      selectedAnnotationId: state.selectedAnnotationId,
    };

    // If transaction is active, do not push intermediate state
    if (txManagerRef.current.isTransactionActive()) {
      return;
    }

    // If state was updated via RESTORE_SNAPSHOT, history is already in sync
    if (
      history.present.annotations === state.annotations &&
      history.present.selectedAnnotationId === state.selectedAnnotationId
    ) {
      lastSnapshotRef.current = currentSnapshot;
      return;
    }

    if (
      lastSnapshotRef.current.annotations !== state.annotations ||
      lastSnapshotRef.current.selectedAnnotationId !== state.selectedAnnotationId
    ) {
      setHistory({ type: 'PUSH', snapshot: currentSnapshot });
      lastSnapshotRef.current = currentSnapshot;
    }
  }, [state.annotations, state.selectedAnnotationId, history.present]);

  const undo = useCallback(() => {
    if (checkCanUndo(history)) {
      const nextHistory = historyUndo(history);
      setHistory({ type: 'UNDO' });
      rawDispatch({ type: 'RESTORE_SNAPSHOT', payload: nextHistory.present });
    }
  }, [history]);

  const redo = useCallback(() => {
    if (checkCanRedo(history)) {
      const nextHistory = historyRedo(history);
      setHistory({ type: 'REDO' });
      rawDispatch({ type: 'RESTORE_SNAPSHOT', payload: nextHistory.present });
    }
  }, [history]);

  const commitGesture = useCallback((finalSnapshot?: HistorySnapshot) => {
    const snap = finalSnapshot ?? {
      annotations: state.annotations,
      selectedAnnotationId: state.selectedAnnotationId,
    };
    setHistory({ type: 'COMMIT_TX', finalSnapshot: snap });
    lastSnapshotRef.current = snap;
  }, [state.annotations, state.selectedAnnotationId]);

  const value: AppContextValue = {
    state,
    dispatch,
    history,
    canUndo: checkCanUndo(history),
    canRedo: checkCanRedo(history),
    undo,
    redo,
    resetHistory: resetHistoryCallback,
    txManager: txManagerRef.current,
    commitGesture,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
