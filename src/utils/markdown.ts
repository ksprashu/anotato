export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return '<span class="text-slate-500 italic text-xs">No notes provided. Click to edit.</span>';
  }

  let html = escapeHtml(markdown);

  // Fenced Code Blocks (```...```)
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="bg-slate-950 p-2 rounded my-1.5 overflow-x-auto text-[11px] font-mono text-amber-300 border border-slate-800"><code>${code.trim()}</code></pre>`;
  });

  // Inline Code (`code`)
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code class="bg-slate-950 text-amber-300 px-1 py-0.5 rounded text-[11px] font-mono border border-slate-800">$1</code>'
  );

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xs font-bold text-slate-100 mt-1 mb-0.5">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xs font-bold text-slate-100 mt-1 mb-0.5">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-sm font-bold text-white mt-1 mb-0.5">$1</h1>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-100">$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong class="font-semibold text-slate-100">$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-300">$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em class="italic text-slate-300">$1</em>');

  // Strikethrough (~~text~~)
  html = html.replace(/~~([^~]+)~~/g, '<del class="line-through text-slate-500">$1</del>');

  // Unordered Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-3 list-disc text-slate-300 text-xs my-0.5">$1</li>');

  // Safe Links
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|#[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-amber-400 underline hover:text-amber-300 font-medium">$1</a>'
  );

  // Line breaks
  html = html.replace(/\n\n/g, '<div class="h-1.5"></div>');
  html = html.replace(/\n/g, '<br />');

  return html;
}
