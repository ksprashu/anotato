import React from 'react';
import { MessageSquareDashed } from 'lucide-react';

export interface EmptySidebarStateProps {
  className?: string;
}

export const EmptySidebarState: React.FC<EmptySidebarStateProps> = ({ className = '' }) => {
  return (
    <div
      data-testid="sidebar-empty-state"
      role="status"
      className={`h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 my-auto ${className}`}
    >
      <div
        data-testid="sidebar-empty-icon"
        className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-3 shadow-inner"
      >
        <MessageSquareDashed className="w-6 h-6 text-amber-500 dark:text-amber-400/70" />
      </div>
      <h3
        data-testid="sidebar-empty-title"
        className="text-sm font-medium text-slate-800 dark:text-slate-300 mb-1"
      >
        No annotations yet
      </h3>
      <p
        data-testid="sidebar-empty-description"
        className="text-xs text-slate-500 max-w-[220px] leading-relaxed"
      >
        Select a tool (Box, Circle, Arrow, Pin) and draw on the canvas to add visual callouts and notes.
      </p>
    </div>
  );
};

export default EmptySidebarState;
