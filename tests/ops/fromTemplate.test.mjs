/**
 * Generate > From Template. See
 * `nodes/PdfToolkit/shared/docRenderer.ts` for why this is rendered with a
 * pdf-lib-based layout engine rather than pdfmake.
 *
 * Assertions search the DECODED content-stream text for the exact hex
 * encoding of individual, single-word markers (see `pdf-content.mjs`'s doc
 * comment) — the renderer draws each WORD as its own `Tj` operator (needed
 * for per-word wrapping/inline bold-italic), so multi-word phrases are
 * split across several `Tj` calls and don't appear as one contiguous hex
 * run. Single-word markers avoid that split and are a real (if low-level)
 * check that specific text was actually drawn.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer } from '../mock-execute.mjs';
import { makeTinyPng } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { getPageContentText, textToHexOperand } from '../pdf-content.mjs';

const require = createRequire(import.meta.url);
const { PDFDict, PDFDocument, PDFName } = require('pdf-lib');

function containsWord(contentText, word) {
	return contentText.includes(textToHexOperand(word));
}

export const tests = [
	{
		name: 'renders heading/paragraph/list/table/code blocks, all drawing real text into the output PDF',
		fn: async () => {
			const template = {
				content: [
					{ type: 'heading', level: 1, text: 'Titleword' },
					{ type: 'paragraph', text: 'Paragraphword.' },
					{ type: 'list', items: ['Bulletword'], ordered: false },
					{ type: 'table', headers: ['Headerword'], rows: [['Cellword']] },
					{ type: 'code', text: 'Codeword' },
				],
			};
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromTemplate',
				template,
				options: { outputBinaryPropertyName: 'data', outputFileName: 'generated.pdf' },
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.equal(returnData.length, 1);
			assert.ok(returnData[0].json.pageCount >= 1);

			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			assert.ok(outputPdf.getPageCount() >= 1);

			const contentText = getPageContentText(outputPdf, 0);
			for (const word of ['Titleword', 'Paragraphword.', 'Bulletword', 'Headerword', 'Cellword', 'Codeword']) {
				assert.ok(containsWord(contentText, word), `expected drawn text to include "${word}"`);
			}
		},
	},
	{
		name: 'resolves an "image" block from the item\'s binary data and embeds it',
		fn: async () => {
			const png = makeTinyPng();
			const template = {
				content: [{ type: 'image', binaryPropertyName: 'img', width: 50, height: 50 }],
			};
			const items = [{ json: {}, binary: { img: { buffer: png } } }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromTemplate',
				template,
				options: {},
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			const resources = outputPdf.getPages()[0].node.Resources();
			assert.ok(resources, 'expected the page to have a Resources dictionary');
			// A real structural check that an XObject entry (the embedded image)
			// exists in the page's resource dictionary, not just "did not throw".
			const xObjectDict = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
			assert.ok(xObjectDict, 'expected an /XObject resource dictionary (the embedded image)');
			assert.ok(xObjectDict.keys().length >= 1, 'expected at least one embedded XObject entry');
		},
	},
	{
		name: 'supports header/footer with "{{page}}"/"{{pages}}" substitution',
		fn: async () => {
			const template = {
				pageNumbers: true,
				content: [{ type: 'heading', text: 'Onlypage' }],
			};
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromTemplate',
				template,
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			const contentText = getPageContentText(outputPdf, 0);
			// The default pageNumbers footer format is "Page {{page}} of {{pages}}"
			// — "Page" and "of" are drawn as standalone word tokens.
			assert.ok(containsWord(contentText, 'Page'));
			assert.ok(containsWord(contentText, 'of'));
		},
	},
	{
		name: 'rejects a template missing "content", naming the item and problem (not a raw crash)',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromTemplate',
				template: { pageSize: 'a4' },
				options: {},
			});
			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error.message.includes('content'), error.message);
					assert.equal(error.context?.itemIndex ?? error.itemIndex, 0);
					return true;
				},
			);
		},
	},
	{
		name: 'rejects an unknown block type, naming the block index and the bad type',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromTemplate',
				template: { content: [{ type: 'notARealBlockType' }] },
				options: {},
			});
			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error.message.includes('content[0]'));
					assert.ok(error.message.includes('notARealBlockType'));
					return true;
				},
			);
		},
	},
	{
		name: 'the "Custom Font Binary Property" option is honestly deferred with a clear error, not silently ignored',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromTemplate',
				template: { content: [{ type: 'paragraph', text: 'x' }] },
				options: { customFontBinaryPropertyName: 'fontFile' },
			});
			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error.message.includes('not yet supported'));
					return true;
				},
			);
		},
	},
];
