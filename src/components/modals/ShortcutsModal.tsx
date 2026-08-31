import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Keyboard,
  X,
  Search,
  MousePointer2,
  Maximize2,
  Undo2,
  FileText,
  Download,
  Command,
  Monitor,
  Sparkles,
} from 'lucide-react';
import {
  CATEGORIZED_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  ShortcutCategory,
  ShortcutDefinition,
} from '../../constants/shortcuts';

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent || '');
}

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: ShortcutCategory | 'all';
  initialSearch?: string;
  className?: string;
}

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  MousePointer2,
  Maximize2,
  Undo2,
  FileText,
  Download,
};

export const KbdBadge: React.FC<{
  keys: string[];
  className?: string;
}> = ({ keys, className = '' }) => {
  return (
    <div className={`flex items-center gap-1 shrink-0 ${className}`}>
      {keys.map((k, i) => {
        if (k === '+' || k === 'or') {
          return (
            <span key={i} className="text-[10px] text-slate-500 font-medium select-none px-0.5">
              {k}
            </span>
          );
        }
        return (
          <kbd
            key={i}
            className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-mono font-semibold shadow-xs select-none"
          >
            {k}
          </kbd>
        );
      })}
    </div>
  );
};

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'all',
  initialSearch = '',
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState<ShortcutCategory | 'all'>(initialCategory);
  const [isMac, setIsMac] = useState<boolean>(true);

  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Initialize platform detection on mount
  useEffect(() => {
    setIsMac(isMacPlatform());
  }, []);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      setSearchQuery(initialSearch);
      setSelectedCategory(initialCategory);

      // Focus search input or close button after render
      const focusTimer = setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        } else {
          closeButtonRef.current?.focus();
        }
      }, 50);

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        clearTimeout(focusTimer);
        document.body.style.overflow = originalOverflow;
        // Restore focus on close
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isOpen, initialCategory, initialSearch]);

  // Focus Trap & Global Escape Listener
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap logic
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  // Filtered Shortcuts Calculation
  const filteredShortcuts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return CATEGORIZED_SHORTCUTS.filter((shortcut) => {
      // Category filter
      if (selectedCategory !== 'all' && shortcut.category !== selectedCategory) {
        return false;
      }

      // Search query filter
      if (!query) return true;

      const matchesTitle = shortcut.title.toLowerCase().includes(query);
      const matchesDesc = shortcut.description.toLowerCase().includes(query);
      const matchesCategory = shortcut.category.toLowerCase().includes(query);
      const matchesKeywords = shortcut.keywords?.some((k) => k.toLowerCase().includes(query));
      const matchesKeys = shortcut.keys.some((k) => k.toLowerCase().includes(query));
      const matchesMac = shortcut.macKeys.some((k) => k.toLowerCase().includes(query));
      const matchesWin = shortcut.winKeys.some((k) => k.toLowerCase().includes(query));

      return (
        matchesTitle ||
        matchesDesc ||
        matchesCategory ||
        matchesKeywords ||
        matchesKeys ||
        matchesMac ||
        matchesWin
      );
    });
  }, [searchQuery, selectedCategory]);

  // Group filtered shortcuts by category
  const groupedCategories = useMemo(() => {
    const groups: { meta: (typeof SHORTCUT_CATEGORIES)[0]; items: ShortcutDefinition[] }[] = [];

    SHORTCUT_CATEGORIES.forEach((cat) => {
      const items = filteredShortcuts.filter((s) => s.category === cat.id);
      if (items.length > 0) {
        groups.push({ meta: cat, items });
      }
    });

    return groups;
  }, [filteredShortcuts]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      aria-describedby="shortcuts-modal-description"
      data-testid="shortcuts-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Clickable Backdrop overlay element for integration tests */}
      <div
        data-testid="shortcuts-modal-backdrop"
        className="absolute inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        data-testid="shortcuts-modal-dialog"
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-left animate-in zoom-in-95 duration-150 text-slate-900 dark:text-slate-100 ${className}`}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-inner">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="shortcuts-modal-title"
                data-testid="shortcuts-modal-title"
                className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2"
              >
                Keyboard Shortcuts
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700">
                  Cheat-Sheet
                </span>
              </h2>
              <p id="shortcuts-modal-description" className="text-xs text-slate-500 dark:text-slate-400">
                Speed up your visual annotation workflow with keybindings
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Platform Toggle (Mac vs Win/Linux) */}
            <div
              className="flex items-center bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
              role="group"
              aria-label="Platform key formatting"
            >
              <button
                type="button"
                data-testid="platform-toggle-mac"
                onClick={() => setIsMac(true)}
                className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  isMac
                    ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-xs font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="View macOS shortcuts"
                aria-pressed={isMac}
              >
                <Command className="w-3 h-3" />
                <span>Mac</span>
              </button>
              <button
                type="button"
                data-testid="platform-toggle-win"
                onClick={() => setIsMac(false)}
                className={`px-2 py-1 rounded-md transition-colors flex items-center gap-1 ${
                  !isMac
                    ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 shadow-xs font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="View Windows / Linux shortcuts"
                aria-pressed={!isMac}
              >
                <Monitor className="w-3 h-3" />
                <span>Win / Linux</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              ref={closeButtonRef}
              type="button"
              data-testid="shortcuts-modal-close-btn"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition"
              title="Close modal (Esc)"
              aria-label="Close shortcuts modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Category Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              data-testid="shortcuts-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts (e.g. box, zoom, undo, cmd+c)..."
              className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition"
              aria-label="Search shortcuts"
            />
            {searchQuery && (
              <button
                type="button"
                data-testid="shortcuts-search-clear-btn"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title="Clear search"
                aria-label="Clear search query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div
            className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar text-xs"
            role="tablist"
            aria-label="Shortcut categories"
          >
            <button
              type="button"
              data-testid="category-tab-all"
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1.5 rounded-lg font-medium transition shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
              role="tab"
              aria-selected={selectedCategory === 'all'}
            >
              All
            </button>
            {SHORTCUT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                data-testid={`category-tab-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1.5 rounded-lg font-medium transition shrink-0 ${
                  selectedCategory === cat.id
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
                role="tab"
                aria-selected={selectedCategory === cat.id}
              >
                {cat.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Shortcut Cards Content */}
        <div
          data-testid="shortcuts-modal-content"
          className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar"
        >
          {groupedCategories.length === 0 ? (
            /* Empty State */
            <div
              data-testid="shortcuts-empty-state"
              className="py-12 flex flex-col items-center justify-center text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No shortcuts found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  We couldn't find any keybindings matching &ldquo;<span className="text-amber-600 dark:text-amber-400 font-mono">{searchQuery}</span>&rdquo;.
                </p>
              </div>
              <button
                type="button"
                data-testid="shortcuts-reset-search-btn"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-400 text-xs font-semibold border border-slate-300 dark:border-slate-700 transition"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            /* Category Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {groupedCategories.map(({ meta, items }) => {
                const CategoryIcon = CATEGORY_ICONS[meta.iconName] || Sparkles;
                return (
                  <div
                    key={meta.id}
                    data-testid={`shortcut-category-card-${meta.id}`}
                    className="rounded-xl border border-slate-200 dark:border-slate-800/90 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-3 shadow-xs"
                  >
                    {/* Category Title & Icon */}
                    <div
                      data-testid={`shortcuts-category-${meta.id}`}
                      className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800/80 text-amber-600 dark:text-amber-400"
                    >
                      <CategoryIcon className="w-4 h-4" />
                      <h3 className="font-semibold text-xs text-slate-800 dark:text-slate-100 tracking-wide uppercase">
                        {meta.name}
                      </h3>
                      <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {items.length}
                      </span>
                    </div>

                    {/* Shortcuts List */}
                    <div className="space-y-2.5">
                      {items.map((shortcut) => {
                        const keysToRender = isMac ? shortcut.macKeys : shortcut.winKeys;
                        return (
                          <div
                            key={shortcut.id}
                            data-testid={`shortcut-row-${shortcut.id}`}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                {shortcut.title}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {shortcut.description}
                              </div>
                            </div>
                            <KbdBadge keys={keysToRender} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
            <span>
              Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-amber-700 dark:text-amber-400 font-mono font-bold">?</kbd> anywhere to toggle this guide.
            </span>
          </div>

          <button
            type="button"
            data-testid="shortcuts-modal-done-btn"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
