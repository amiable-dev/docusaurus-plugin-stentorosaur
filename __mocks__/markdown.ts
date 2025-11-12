/**
 * Mock for src/utils/markdown.ts
 * Used in Jest tests to avoid ESM module issues with marked/dompurify
 */

export function markdownToHtml(markdown: string | undefined): string {
  if (!markdown) return '';
  // Simple mock - just return the markdown as-is
  return markdown;
}

export function MarkdownContent({ content }: { content: string | undefined }) {
  if (!content) return null;
  return { type: 'div', props: { children: content } };
}
