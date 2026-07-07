/**
 * Generate > From Markdown. Shares the pdf-lib-based layout engine
 * (`shared/docRenderer.ts`) with From Template, via the hand-written parser
 * in `shared/markdown.ts` (unit-tested directly in `tests/shared/markdown.test.mjs`).
 *
 * As with `fromTemplate.test.mjs`, assertions search for single-word markers
 * (each word is its own `Tj` operator in the output — see that file's doc
 * comment for why multi-word phrases don't appear as one contiguous hex run).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer } from '../mock-execute.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { getPageContentText, textToHexOperand } from '../pdf-content.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

function containsWord(contentText, word) {
	return contentText.includes(textToHexOperand(word));
}

const SAMPLE_MARKDOWN = `# Headingword

Paragraphword with **Boldword** and *Italicword*.

- Bulletword

1. Numberedword

\`\`\`
Codewordline
\`\`\`

| Headerword |
| --- |
| Cellword |
`;

export const tests = [
	{
		name: 'renders a full sample (heading, paragraph with bold/italic, lists, code, table) into a non-empty PDF',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: SAMPLE_MARKDOWN,
				options: { outputBinaryPropertyName: 'data', outputFileName: 'document.pdf' },
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.equal(returnData.length, 1);
			assert.ok(returnData[0].json.pageCount >= 1);

			const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
			assert.ok(outputBuffer.length > 0);
			const outputPdf = await PDFDocument.load(outputBuffer);
			assert.ok(outputPdf.getPageCount() >= 1);

			const contentText = getPageContentText(outputPdf, 0);
			for (const word of [
				'Headingword',
				'Paragraphword',
				'Boldword',
				'Italicword',
				'Bulletword',
				'Numberedword',
				'Codewordline',
				'Headerword',
				'Cellword',
			]) {
				assert.ok(containsWord(contentText, word), `expected drawn text to include "${word}"`);
			}
		},
	},
	{
		name: 'empty Markdown input produces a valid, loadable, single (blank) page PDF rather than throwing',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: '',
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			// The layout engine always starts on a page (constructed up front, see
			// `Layout`'s constructor in docRenderer.ts) even with zero content
			// blocks — so "empty input" is 1 blank page, not 0 pages.
			assert.equal(outputPdf.getPageCount(), 1);
			assert.equal(returnData[0].json.pageCount, 1);
		},
	},
];
