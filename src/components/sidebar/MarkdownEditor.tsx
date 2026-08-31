import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Code,
  List,
  Heading,
  Eye,
  Edit3,
  Columns,
} from 'lucide-react';

export type EditorViewMode = 'edit' | 'preview' | 'split';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  defaultMode?: EditorViewMode;
  className?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  annotationId?: string;
}

import { renderMarkdownToHtml } from '../../utils/markdown';

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Add notes, tasks, or markdown...',
  autoFocus = false,
  disabled = false,
  defaultMode = 'edit',
  className = '',
  onBlur,
  onFocus,
  annotationId,
}) => {
  const [mode, setMode] = useState<EditorViewMode>(defaultMode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expanding textarea height
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(64, textarea.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    if (mode === 'edit' || mode === 'split') {
      adjustHeight();
    }
  }, [value, mode, adjustHeight]);

  // Apply formatting helper
  const applyFormatting = (prefix: string, suffix = prefix, defaultPlaceholder = 'text') => {
    if (disabled) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = '';
    let newCursorStart = 0;
    let newCursorEnd = 0;

    if (prefix === '- ' || prefix === '### ') {
      const before = text.substring(0, start);
      const after = text.substring(end);
      const actualPrefix = before.length === 0 || before.endsWith('\n') ? prefix : `\n${prefix}`;
      const content = selectedText || defaultPlaceholder;
      replacement = `${actualPrefix}${content}`;
      const newText = before + replacement + after;
      onChange(newText);
      newCursorStart = start + actualPrefix.length;
      newCursorEnd = newCursorStart + content.length;
    } else {
      const content = selectedText || defaultPlaceholder;
      replacement = `${prefix}${content}${suffix}`;
      const newText = text.substring(0, start) + replacement + text.substring(end);
      onChange(newText);
      newCursorStart = start + prefix.length;
      newCursorEnd = newCursorStart + content.length;
    }

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorStart, newCursorEnd);
        adjustHeight();
      }
    }, 0);
  };

  // Keyboard navigation & shortcut handlers
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const hasMetaOrCtrl = e.metaKey || e.ctrlKey;

    // 1. Tab / Shift+Tab Indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      if (e.shiftKey) {
        // Shift+Tab: Remove leading 2 spaces if present
        const before = text.substring(0, start);
        if (before.endsWith('  ')) {
          const newText = text.substring(0, start - 2) + text.substring(start);
          onChange(newText);
          setTimeout(() => {
            textarea.setSelectionRange(Math.max(0, start - 2), Math.max(0, end - 2));
          }, 0);
        }
      } else {
        // Tab: Insert 2 spaces
        const newText = text.substring(0, start) + '  ' + text.substring(end);
        onChange(newText);
        setTimeout(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        }, 0);
      }
      return;
    }

    // 2. Cmd+Enter / Ctrl+Enter: Blur / Commit
    if (hasMetaOrCtrl && e.key === 'Enter') {
      e.preventDefault();
      textareaRef.current?.blur();
      return;
    }

    // 3. Escape: Blur / Cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      textareaRef.current?.blur();
      return;
    }

    // 4. Cmd+B: Bold
    if (hasMetaOrCtrl && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      applyFormatting('**', '**', 'bold text');
      return;
    }

    // 5. Cmd+I: Italic
    if (hasMetaOrCtrl && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      applyFormatting('*', '*', 'italic text');
      return;
    }
  };

  const textareaTestId = annotationId ? `note-textarea-${annotationId}` : 'markdown-textarea';

  return (
    <div
      data-testid="markdown-editor"
      className={`flex flex-col rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60 overflow-hidden ${className}`}
    >
      {/* Markdown Toolbar */}
      <div
        data-testid="markdown-toolbar"
        className="flex items-center justify-between px-2 py-1 bg-slate-100 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 select-none text-xs"
      >
        {/* Formatting Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            data-testid="md-btn-bold"
            onClick={() => applyFormatting('**', '**', 'bold text')}
            disabled={disabled || mode === 'preview'}
            className="p-1 rounded hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Bold (**text**)"
            aria-label="Format bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="md-btn-italic"
            onClick={() => applyFormatting('*', '*', 'italic text')}
            disabled={disabled || mode === 'preview'}
            className="p-1 rounded hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Italic (*text*)"
            aria-label="Format italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="md-btn-code"
            onClick={() => applyFormatting('`', '`', 'code')}
            disabled={disabled || mode === 'preview'}
            className="p-1 rounded hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Inline Code (`code`)"
            aria-label="Format inline code"
          >
            <Code className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="md-btn-list"
            onClick={() => applyFormatting('- ', '', 'List item')}
            disabled={disabled || mode === 'preview'}
            className="p-1 rounded hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Bullet List (- item)"
            aria-label="Format bullet list"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="md-btn-heading"
            onClick={() => applyFormatting('### ', '', 'Heading')}
            disabled={disabled || mode === 'preview'}
            className="p-1 rounded hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title="Heading (### Heading)"
            aria-label="Format heading"
          >
            <Heading className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* View Mode Toggle Buttons */}
        <div className="flex items-center gap-0.5 bg-slate-200/60 dark:bg-slate-950 p-0.5 rounded border border-slate-300 dark:border-slate-800/80">
          <button
            type="button"
            data-testid="md-mode-edit"
            onClick={() => setMode('edit')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              mode === 'edit'
                ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Edit mode"
            aria-label="Switch to edit mode"
            aria-pressed={mode === 'edit'}
          >
            <Edit3 className="w-3 h-3" />
            <span className="hidden sm:inline">Edit</span>
          </button>

          <button
            type="button"
            data-testid="md-mode-preview"
            onClick={() => setMode('preview')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              mode === 'preview'
                ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Preview mode"
            aria-label="Switch to preview mode"
            aria-pressed={mode === 'preview'}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">Preview</span>
          </button>

          <button
            type="button"
            data-testid="md-mode-split"
            onClick={() => setMode('split')}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
              mode === 'split'
                ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Split view"
            aria-label="Switch to split view"
            aria-pressed={mode === 'split'}
          >
            <Columns className="w-3 h-3" />
            <span className="hidden sm:inline">Split</span>
          </button>
        </div>
      </div>

      {/* Editor & Preview Area */}
      <div className={`grid ${mode === 'split' ? 'grid-cols-2 divide-x divide-slate-200 dark:divide-slate-800' : 'grid-cols-1'}`}>
        {/* Edit View */}
        {(mode === 'edit' || mode === 'split') && (
          <textarea
            ref={textareaRef}
            data-testid={textareaTestId}
            data-textarea-generic="markdown-textarea"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
            rows={2}
            className="w-full bg-transparent p-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none min-h-[64px] leading-relaxed"
            aria-label="Markdown note editor"
          />
        )}

        {/* Preview View */}
        {(mode === 'preview' || mode === 'split') && (
          <div
            data-testid="markdown-preview"
            onClick={() => {
              if (mode === 'preview') setMode('edit');
            }}
            className="p-2 text-xs leading-relaxed text-slate-800 dark:text-slate-200 overflow-y-auto max-h-[300px] min-h-[64px] cursor-text"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(value) }}
          />
        )}
      </div>
    </div>
  );
};

export default MarkdownEditor;
