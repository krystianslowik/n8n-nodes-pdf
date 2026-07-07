/**
 * Unit tests for `nodes/PdfToolkit/shared/markdown.ts`. Loaded
 * directly via `tests/util/load-ts.mjs` (esbuild transpile, no full node
 * build required) — this module has no pdf-lib dependency to exercise for
 * real (see `tests/util/load-ts.mjs`'s doc comment for that boundary), only
 * `import type`s from `docRenderer.ts` (erased at transpile time).
 */
import assert from 'node:assert/strict';

import { nodesPdfToolkitPath, requireTs } from '../util/load-ts.mjs';

const { parseInline, parseMarkdown } = requireTs(nodesPdfToolkitPath('shared', 'markdown.ts'));

export const tests = [
	{
		name: 'parseInline: plain text with no markup is a single run',
		fn: () => {
			assert.deepEqual(parseInline('hello world'), [{ text: 'hello world' }]);
		},
	},
	{
		name: 'parseInline: **bold** and __bold__ both produce a bold run',
		fn: () => {
			assert.deepEqual(parseInline('**a**'), [{ text: 'a', bold: true }]);
			assert.deepEqual(parseInline('__a__'), [{ text: 'a', bold: true }]);
		},
	},
	{
		name: 'parseInline: *italic* and _italic_ both produce an italic run',
		fn: () => {
			assert.deepEqual(parseInline('*a*'), [{ text: 'a', italic: true }]);
			assert.deepEqual(parseInline('_a_'), [{ text: 'a', italic: true }]);
		},
	},
	{
		name: 'parseInline: `code` produces a code run',
		fn: () => {
			assert.deepEqual(parseInline('`a`'), [{ text: 'a', code: true }]);
		},
	},
	{
		name: 'parseInline: mixed plain/bold/italic text preserves order and surrounding plain text',
		fn: () => {
			const runs = parseInline('Hello **bold** and *italic* end.');
			assert.deepEqual(runs, [
				{ text: 'Hello ' },
				{ text: 'bold', bold: true },
				{ text: ' and ' },
				{ text: 'italic', italic: true },
				{ text: ' end.' },
			]);
		},
	},
	{
		name: 'parseMarkdown: "#" through "######" clamp to heading levels 1-3',
		fn: () => {
			const blocks = parseMarkdown('# One\n\n## Two\n\n### Three\n\n#### Four\n\n###### Six\n');
			assert.equal(blocks.length, 5);
			assert.deepEqual(
				blocks.map((b) => b.level),
				[1, 2, 3, 3, 3],
			);
			assert.deepEqual(blocks[0].text, [{ text: 'One' }]);
		},
	},
	{
		name: 'parseMarkdown: consecutive non-blank lines merge into one paragraph',
		fn: () => {
			const blocks = parseMarkdown('Line one\nLine two continues.\n\nNew paragraph.');
			assert.equal(blocks.length, 2);
			assert.equal(blocks[0].type, 'paragraph');
			assert.deepEqual(blocks[0].text, [{ text: 'Line one Line two continues.' }]);
			assert.deepEqual(blocks[1].text, [{ text: 'New paragraph.' }]);
		},
	},
	{
		name: 'parseMarkdown: "-", "*", and "+" all parse as one unordered list',
		fn: () => {
			const blocks = parseMarkdown('- alpha\n* beta\n+ gamma\n');
			assert.equal(blocks.length, 1);
			assert.equal(blocks[0].type, 'list');
			assert.equal(blocks[0].ordered, false);
			assert.deepEqual(
				blocks[0].items.map((item) => item[0].text),
				['alpha', 'beta', 'gamma'],
			);
		},
	},
	{
		name: 'parseMarkdown: "1." / "2)" numbered lists parse as one ordered list',
		fn: () => {
			const blocks = parseMarkdown('1. first\n2) second\n');
			assert.equal(blocks.length, 1);
			assert.equal(blocks[0].type, 'list');
			assert.equal(blocks[0].ordered, true);
			assert.deepEqual(
				blocks[0].items.map((item) => item[0].text),
				['first', 'second'],
			);
		},
	},
	{
		name: 'parseMarkdown: a fenced code block preserves every line verbatim, including blank lines',
		fn: () => {
			const blocks = parseMarkdown('```\nfirst line\n\nthird line\n```\n');
			assert.equal(blocks.length, 1);
			assert.equal(blocks[0].type, 'code');
			assert.equal(blocks[0].text, 'first line\n\nthird line');
		},
	},
	{
		name: 'parseMarkdown: an unterminated fenced code block does not hang or lose content',
		fn: () => {
			const blocks = parseMarkdown('```\nonly line');
			assert.equal(blocks.length, 1);
			assert.equal(blocks[0].type, 'code');
			assert.equal(blocks[0].text, 'only line');
		},
	},
	{
		name: 'parseMarkdown: a GFM pipe table parses headers and rows',
		fn: () => {
			const blocks = parseMarkdown('| A | B |\n| --- | :---: |\n| 1 | 2 |\n| 3 | 4 |\n');
			assert.equal(blocks.length, 1);
			assert.equal(blocks[0].type, 'table');
			assert.deepEqual(blocks[0].headers, ['A', 'B']);
			assert.deepEqual(blocks[0].rows, [
				['1', '2'],
				['3', '4'],
			]);
		},
	},
	{
		name: 'parseMarkdown: table parsing stops at the first blank line',
		fn: () => {
			const blocks = parseMarkdown('| A |\n| --- |\n| 1 |\n\nAfter.');
			assert.equal(blocks.length, 2);
			assert.equal(blocks[0].type, 'table');
			assert.equal(blocks[0].rows.length, 1);
			assert.equal(blocks[1].type, 'paragraph');
		},
	},
	{
		name: 'parseMarkdown: a heading immediately followed by a list and a paragraph parses as three distinct blocks',
		fn: () => {
			const blocks = parseMarkdown('# Title\n- item\nParagraph text.');
			assert.deepEqual(blocks.map((b) => b.type), ['heading', 'list', 'paragraph']);
		},
	},
	{
		name: 'parseMarkdown: blank/whitespace-only input produces no blocks',
		fn: () => {
			assert.deepEqual(parseMarkdown('\n\n   \n'), []);
		},
	},
	{
		name: 'parseInline: ~~strikethrough~~ produces a strike run',
		fn: () => {
			assert.deepEqual(parseInline('~~gone~~'), [{ text: 'gone', strike: true }]);
		},
	},
	{
		name: 'parseInline: [text](url) produces a link run; image/reference forms degrade to plain text',
		fn: () => {
			assert.deepEqual(parseInline('see [docs](https://example.com) now'), [
				{ text: 'see ' },
				{ text: 'docs', link: 'https://example.com' },
				{ text: ' now' },
			]);
			// Unsupported forms must never leave raw bracket syntax behind.
			assert.deepEqual(parseInline('![alt text](https://x.co/i.png)'), [{ text: 'alt text' }]);
			assert.deepEqual(parseInline('[ref link][1]'), [{ text: 'ref link' }]);
		},
	},
	{
		name: 'parseInline: a space at a styled-run boundary survives exactly ("*Tuesday,* for")',
		fn: () => {
			assert.deepEqual(parseInline('*Tuesday,* for the team'), [
				{ text: 'Tuesday,', italic: true },
				{ text: ' for the team' },
			]);
		},
	},
	{
		name: 'parseMarkdown: "> ..." lines form a quote block (multi-line, inline styles intact), no literal ">"',
		fn: () => {
			const blocks = parseMarkdown('> quoted **bold** text\n> and more\n\nAfter.');
			assert.equal(blocks.length, 2);
			assert.equal(blocks[0].type, 'quote');
			assert.deepEqual(blocks[0].text, [
				{ text: 'quoted ' },
				{ text: 'bold', bold: true },
				{ text: ' text and more' },
			]);
			assert.equal(blocks[1].type, 'paragraph');
		},
	},
	{
		name: 'parseMarkdown: standalone ---/***/___/- - - lines are hr blocks (thematic breaks)',
		fn: () => {
			const blocks = parseMarkdown('a\n\n---\n\n***\n\n___\n\n- - -\n\nb');
			assert.deepEqual(
				blocks.map((b) => b.type),
				['paragraph', 'hr', 'hr', 'hr', 'hr', 'paragraph'],
			);
		},
	},
	{
		name: 'parseMarkdown: "---" directly under a paragraph line is a setext level-2 heading, not an hr ("===" is level 1)',
		fn: () => {
			const blocks = parseMarkdown('Title\n---\n\nBig\n===\n');
			assert.deepEqual(
				blocks.map((b) => [b.type, b.level]),
				[
					['heading', 2],
					['heading', 1],
				],
			);
			assert.deepEqual(blocks[0].text, [{ text: 'Title' }]);
		},
	},
];
