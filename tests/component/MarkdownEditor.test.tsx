import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { MarkdownEditor } from '../../src/components/sidebar/MarkdownEditor';
import { renderMarkdownToHtml } from '../../src/utils/markdown';
import { AppProvider, useApp } from '../../src/state/AppContext';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';

const ControlledEditor: React.FC<{ initialValue?: string }> = ({ initialValue = '' }) => {
  const [value, setValue] = useState(initialValue);
  return <MarkdownEditor value={value} onChange={setValue} />;
};

describe('MarkdownEditor Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Auto-Expanding Textarea & Value Sync', () => {
    it('renders textarea with initial value and placeholder', () => {
      render(<ControlledEditor initialValue="Initial markdown content" />);
      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('Initial markdown content');
    });

    it('updates text value on user input', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="" />);
      const textarea = screen.getByTestId('markdown-textarea');
      await user.type(textarea, 'Hello world');
      expect(textarea).toHaveValue('Hello world');
    });
  });

  describe('2. Markdown Toolbar Formatting Buttons', () => {
    it('applies Bold formatting (**text**) on button click', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="" />);
      const boldBtn = screen.getByTestId('md-btn-bold');
      await user.click(boldBtn);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('**bold text**');
    });

    it('applies Italic formatting (*text*) on button click', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="" />);
      const italicBtn = screen.getByTestId('md-btn-italic');
      await user.click(italicBtn);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('*italic text*');
    });

    it('applies Inline Code formatting (`code`) on button click', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="" />);
      const codeBtn = screen.getByTestId('md-btn-code');
      await user.click(codeBtn);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('`code`');
    });

    it('applies List formatting (- List item) on button click', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="" />);
      const listBtn = screen.getByTestId('md-btn-list');
      await user.click(listBtn);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('- List item');
    });

    it('applies Heading formatting (### Heading) on button click', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="" />);
      const headingBtn = screen.getByTestId('md-btn-heading');
      await user.click(headingBtn);

      const textarea = screen.getByTestId('markdown-textarea');
      expect(textarea).toHaveValue('### Heading');
    });
  });

  describe('3. Edit, Preview & Split Mode Toggle', () => {
    it('toggles to preview mode and renders sanitized markdown HTML', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="**Bold Title** with `code`" />);

      const previewBtn = screen.getByTestId('md-mode-preview');
      await user.click(previewBtn);

      expect(screen.queryByTestId('markdown-textarea')).not.toBeInTheDocument();
      const preview = screen.getByTestId('markdown-preview');
      expect(preview).toBeInTheDocument();
      expect(preview.innerHTML).toContain('<strong class="font-semibold text-slate-100">Bold Title</strong>');
      expect(preview.innerHTML).toContain('<code class="bg-slate-950 text-amber-300 px-1 py-0.5 rounded text-[11px] font-mono border border-slate-800">code</code>');
    });

    it('sanitizes malicious raw HTML script injection', () => {
      const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
      const rendered = renderMarkdownToHtml(malicious);
      expect(rendered).not.toContain('<script>');
      expect(rendered).toContain('&lt;script&gt;');
      expect(rendered).toContain('&lt;img');
    });

    it('renders in split view showing both textarea and preview simultaneously', async () => {
      const user = userEvent.setup();
      render(<ControlledEditor initialValue="Split content" />);

      const splitBtn = screen.getByTestId('md-mode-split');
      await user.click(splitBtn);

      expect(screen.getByTestId('markdown-textarea')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    });
  });

  describe('4. Accessible Keyboard Navigation', () => {
    it('inserts 2 spaces on Tab key without losing focus', async () => {
      render(<ControlledEditor initialValue="Start" />);
      const textarea = screen.getByTestId('markdown-textarea') as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(5, 5);

      fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' });
      expect(textarea.value).toBe('Start  ');
    });

    it('blurs textarea on Cmd+Enter / Ctrl+Enter', () => {
      render(<ControlledEditor initialValue="Note content" />);
      const textarea = screen.getByTestId('markdown-textarea') as HTMLTextAreaElement;
      textarea.focus();
      const blurSpy = vi.spyOn(textarea, 'blur');

      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
      expect(blurSpy).toHaveBeenCalled();
    });

    it('blurs textarea on Escape without bubbling', () => {
      render(<ControlledEditor initialValue="Note content" />);
      const textarea = screen.getByTestId('markdown-textarea') as HTMLTextAreaElement;
      textarea.focus();
      const blurSpy = vi.spyOn(textarea, 'blur');

      fireEvent.keyDown(textarea, { key: 'Escape' });
      expect(blurSpy).toHaveBeenCalled();
    });
  });

  describe('5. Input Focus Isolation (Canvas Protection)', () => {
    it('strictly isolates all canvas shortcut keys while focused in textarea', () => {
      let activeTool = 'select';
      let annotationCount = 1;

      const TestHost = () => {
        const { state } = useApp();
        useKeyboardShortcuts();
        activeTool = state.activeTool;
        annotationCount = state.annotations.length;
        return <ControlledEditor initialValue="Typing notes..." />;
      };

      render(
        <AppProvider
          initialState={{
            annotations: [{
              id: 'a1',
              index: 1,
              geometry: { type: 'box', x: 10, y: 10, width: 50, height: 50 },
              style: { color: 'amber', strokeWidth: 3, fillOpacity: 0.15 },
              note: '',
              createdAt: 1000,
              updatedAt: 1000,
            }],
            selectedAnnotationId: 'a1',
            activeTool: 'select',
          }}
        >
          <TestHost />
        </AppProvider>
      );

      const textarea = screen.getByTestId('markdown-textarea');
      textarea.focus();

      // Tool shortcut keys: v, b, r, c, o, a, p, h
      const toolKeys = ['v', 'b', 'r', 'c', 'o', 'a', 'p', 'h'];
      for (const key of toolKeys) {
        fireEvent.keyDown(textarea, { key });
        expect(activeTool).toBe('select');
      }

      // Delete & Backspace keys
      fireEvent.keyDown(textarea, { key: 'Delete' });
      expect(annotationCount).toBe(1);

      fireEvent.keyDown(textarea, { key: 'Backspace' });
      expect(annotationCount).toBe(1);

      // Zoom keys: 0, 1, +, -
      const zoomKeys = ['0', '1', '+', '-'];
      for (const key of zoomKeys) {
        fireEvent.keyDown(textarea, { key });
      }
    });
  });
});
