/**
 * Hand-written, line-based Markdown -> `DocBlock[]` parser for Generate >
 * From Markdown (PRD F9: "headings, lists, tables, code blocks"). Written by
 * hand (no `marked`/`markdown-it`/etc. dependency, per this group's task
 * scope: "keep the dep surface minimal") — this is deliberately a small
 * subset of CommonMark/GFM, not a spec-compliant parser. Only `import type`s
 * from `./docRenderer` (erased at compile/bundle time), so this module has
 * NO runtime dependency on pdf-lib and can be unit-tested directly (see
 * `tests/shared/markdown.test.mjs`).
 *
 * Supported constructs: headings (`#`..`######`, clamped to heading levels
 * 1-3), paragraphs, inline `**bold**`/`__bold__`, `*italic*`/`_italic_`, and
 * `` `code` ``, bullet lists (`-`/`*`/`+`), numbered lists (`1.`/`1)`),
 * fenced code blocks (` ``` `), and GFM-style pipe tables (header row +
 * `---`/`:--`/`--:` delimiter row + data rows).
 *
 * NOT supported (falls through to a literal paragraph, not an error):
 * nested lists, blockquotes, links, images, horizontal rules, HTML.
 */
import type { DocBlock, InlineText, TextRun } from './docRenderer';

// Matches **bold**, __bold__, *italic*, _italic_, or `code` — checked in
// that order below (bold's double-delimiter form must be tested before the
// single-delimiter italic form, since "**x**" also satisfies "starts/ends
// with a single *").
const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;

/** Parses inline `**bold**`/`*italic*`/`` `code` `` spans in `text` into styled runs. */
export function parseInline(text: string): TextRun[] {
	const parts = text.split(INLINE_PATTERN).filter((part) => part.length > 0);
	const runs: TextRun[] = [];
	for (const part of parts) {
		if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
			runs.push({ text: part.slice(2, -2), bold: true });
		} else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
			runs.push({ text: part.slice(1, -1), code: true });
		} else if (
			(part.startsWith('*') && part.endsWith('*')) ||
			(part.startsWith('_') && part.endsWith('_'))
		) {
			runs.push({ text: part.slice(1, -1), italic: true });
		} else {
			runs.push({ text: part });
		}
	}
	return runs;
}

function parseInlineText(text: string): InlineText {
	return parseInline(text);
}

/** Splits one GFM pipe-table row into trimmed cells, dropping a leading/trailing "|". */
function splitTableRow(line: string): string[] {
	let trimmed = line.trim();
	if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
	if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
	return trimmed.split('|').map((cell) => cell.trim());
}

/** True for a GFM table delimiter row, e.g. "---|:---:|---:" or "|---|---|". */
function isTableDelimiterRow(line: string): boolean {
	if (!line.includes('-')) return false;
	const cells = splitTableRow(line);
	return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const FENCE_PATTERN = /^\s*```/;
const BULLET_PATTERN = /^\s*[-*+]\s+(.+)$/;
const NUMBERED_PATTERN = /^\s*\d+[.)]\s+(.+)$/;

function isParagraphBoundary(line: string, nextLine: string | undefined): boolean {
	return (
		line.trim().length === 0 ||
		HEADING_PATTERN.test(line) ||
		FENCE_PATTERN.test(line) ||
		BULLET_PATTERN.test(line) ||
		NUMBERED_PATTERN.test(line) ||
		(line.includes('|') && nextLine !== undefined && isTableDelimiterRow(nextLine))
	);
}

/**
 * Parses `markdown` into the block model `renderDocument` (docRenderer.ts)
 * consumes, so From Template and From Markdown share one rendering pipeline.
 */
export function parseMarkdown(markdown: string): DocBlock[] {
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const blocks: DocBlock[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.trim().length === 0) {
			i++;
			continue;
		}

		if (FENCE_PATTERN.test(line)) {
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !FENCE_PATTERN.test(lines[i])) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // Skip the closing fence (or fall off the end if unterminated).
			blocks.push({ type: 'code', text: codeLines.join('\n') });
			continue;
		}

		const headingMatch = HEADING_PATTERN.exec(line);
		if (headingMatch) {
			const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
			blocks.push({ type: 'heading', level, text: parseInlineText(headingMatch[2].trim()) });
			i++;
			continue;
		}

		if (line.includes('|') && i + 1 < lines.length && isTableDelimiterRow(lines[i + 1])) {
			const headers = splitTableRow(line);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && lines[i].includes('|') && lines[i].trim().length > 0) {
				rows.push(splitTableRow(lines[i]));
				i++;
			}
			blocks.push({ type: 'table', headers, rows });
			continue;
		}

		if (BULLET_PATTERN.test(line)) {
			const items: InlineText[] = [];
			while (i < lines.length) {
				const match = BULLET_PATTERN.exec(lines[i]);
				if (!match) break;
				items.push(parseInlineText(match[1].trim()));
				i++;
			}
			blocks.push({ type: 'list', items, ordered: false });
			continue;
		}

		if (NUMBERED_PATTERN.test(line)) {
			const items: InlineText[] = [];
			while (i < lines.length) {
				const match = NUMBERED_PATTERN.exec(lines[i]);
				if (!match) break;
				items.push(parseInlineText(match[1].trim()));
				i++;
			}
			blocks.push({ type: 'list', items, ordered: true });
			continue;
		}

		// Paragraph: accumulate consecutive lines until a blank line or the
		// start of another construct. The current line is guaranteed not to be
		// a boundary itself (every check above already ruled that out), so this
		// loop always advances `i` at least once.
		const paragraphLines: string[] = [];
		while (i < lines.length && !isParagraphBoundary(lines[i], lines[i + 1])) {
			paragraphLines.push(lines[i]);
			i++;
		}
		blocks.push({ type: 'paragraph', text: parseInlineText(paragraphLines.join(' ').trim()) });
	}

	return blocks;
}
