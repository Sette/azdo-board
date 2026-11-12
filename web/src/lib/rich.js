// Renderização de campos ricos do Azure DevOps (HTML ou Markdown), sempre sanitizada.
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import TurndownService from 'turndown';

marked.setOptions({ gfm: true, breaks: true });
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function toSafeHtml(value, format) {
  if (!value) return '';
  const html = format === 'markdown' ? marked.parse(value) : value;
  return DOMPurify.sanitize(html);
}

// Texto para o editor: Markdown como está; HTML convertido para Markdown.
export function toEditableMarkdown(value, format) {
  if (!value) return '';
  return format === 'markdown' ? value : turndown.turndown(DOMPurify.sanitize(value));
}
