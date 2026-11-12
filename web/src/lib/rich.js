// Renderização de campos ricos do Azure DevOps (HTML ou Markdown), sempre sanitizada.
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import TurndownService from 'turndown';

marked.setOptions({ gfm: true, breaks: true });
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
turndown.addRule('taskListItem', {
  filter: (node) => node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox',
  replacement: (_content, node) => (node.checked || node.hasAttribute('checked') ? '[x] ' : '[ ] '),
});

let allowInteractiveTasks = false;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'INPUT') {
    if (node.getAttribute('type') !== 'checkbox') {
      node.parentNode?.removeChild(node);
    } else if (allowInteractiveTasks) {
      node.removeAttribute('disabled');
    } else {
      node.setAttribute('disabled', '');
    }
  }
});

export function toSafeHtml(value, format, { interactiveTasks = false } = {}) {
  if (!value) return '';
  const html = format === 'markdown' ? marked.parse(value) : value;
  allowInteractiveTasks = interactiveTasks;
  try {
    return DOMPurify.sanitize(html);
  } finally {
    allowInteractiveTasks = false;
  }
}

// Texto para o editor: Markdown como está; HTML convertido para Markdown.
export function toEditableMarkdown(value, format) {
  if (!value) return '';
  return format === 'markdown' ? value : turndown.turndown(DOMPurify.sanitize(value));
}

const FENCE_RE = /^(\s*(?:>\s*)*)(`{3,}|~{3,})/;
const TASK_RE = /^(\s*(?:>\s*)*(?:[*+-]|\d{1,9}[.)])\s+)\[([ xX])\](?=\s+\S)/;

// Alterna o checkbox de índice `taskIndex` (em ordem de renderização) e devolve o Markdown atualizado.
export function toggleTaskCheckbox(value, format, taskIndex, checked) {
  const md = toEditableMarkdown(value, format);
  const lines = md.split('\n');
  let fence = null;
  let idx = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fm = line.match(FENCE_RE);
    if (fm) {
      const ch = fm[2][0];
      const len = fm[2].length;
      if (!fence) fence = { ch, len };
      else if (fence.ch === ch && len >= fence.len && /^\s*$/.test(line.slice(fm[0].length))) fence = null;
      continue;
    }
    if (fence) continue;
    const tm = line.match(TASK_RE);
    if (!tm) continue;
    if (idx === taskIndex) {
      lines[i] = `${tm[1]}[${checked ? 'x' : ' '}]${line.slice(tm[0].length)}`;
      return lines.join('\n');
    }
    idx += 1;
  }
  return md;
}
