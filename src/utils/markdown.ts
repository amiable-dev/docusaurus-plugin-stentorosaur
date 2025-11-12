/**
 * Copyright (c) Amiable Development
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import React from 'react';

/**
 * Convert markdown to safe HTML
 * @param markdown - Raw markdown string from GitHub Issues
 * @returns Sanitized HTML string safe for rendering
 */
export function markdownToHtml(markdown: string | undefined): string {
  if (!markdown) return '';

  try {
    // Configure marked for GitHub-flavored markdown
    marked.setOptions({
      gfm: true,
      breaks: true,
    });

    const html = marked.parse(markdown) as string;

    // Sanitize to prevent XSS attacks
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'blockquote',
        'a',
        'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'hr',
        'del', 'ins',
      ],
      ALLOWED_ATTR: ['href', 'title', 'src', 'alt', 'target', 'rel'],
    });
  } catch (error) {
    console.error('Error parsing markdown:', error);
    return markdown; // Fall back to plain text
  }
}

/**
 * React component for rendering markdown content
 * @param content - Raw markdown string
 * @returns JSX element with rendered HTML
 */
export function MarkdownContent({ content }: { content: string | undefined }): JSX.Element {
  if (!content) return React.createElement(React.Fragment);

  const html = markdownToHtml(content);
  return React.createElement('div', {
    className: 'markdown-content',
    dangerouslySetInnerHTML: { __html: html },
  });
}
