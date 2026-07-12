/**
 * Write-time markdown → sanitized HTML (ADR-005 §2/§7). SERVER-ONLY:
 * jsdom-backed DOMPurify must never enter client bundles — this module
 * is exported via the '@stentorosaur/core/server' subpath, not the
 * package root. Raw markdown is always retained under status/v1/raw/ so
 * a sanitizer CVE can be answered by re-rendering (stentorosaur
 * regenerate).
 *
 * The tag/attribute allowlist matches the plugin's client-side
 * utils/markdown.ts so rendered output is identical during migration.
 */

import {Marked} from 'marked';
import createDOMPurify from 'dompurify';
import {JSDOM} from 'jsdom';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);

// Reverse-tabnabbing guard: any link carrying target must also carry
// rel="noopener noreferrer" (target stays allowed for renderer parity
// with the plugin's client-side markdown component).
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.hasAttribute('target')) {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// Instance renderer: no global marked.setOptions mutation per call.
const renderer = new Marked({gfm: true, breaks: true});

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'a',
  'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr',
  'del', 'ins',
];
const ALLOWED_ATTR = ['href', 'title', 'src', 'alt', 'target', 'rel'];

export function renderMarkdownToSafeHtml(markdown: string | undefined): string {
  if (!markdown) return '';

  const html = renderer.parse(markdown) as string;

  return DOMPurify.sanitize(html, {ALLOWED_TAGS, ALLOWED_ATTR}).trim();
}
