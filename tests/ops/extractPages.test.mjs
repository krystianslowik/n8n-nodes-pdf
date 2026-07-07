/**
 * Document > Extract Pages: all selected pages land in ONE output
 * PDF (unlike Split, which emits one output item per range).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf, pageNumberFromWidth } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function runExtractPages(buffer, pageRanges) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'document',
		operation: 'extractPages',
		binaryPropertyName: 'data',
		pageRanges,
		options: {},
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1, 'extractPages must produce exactly 1 output item');
	return returnData[0];
}

export const tests = [
	{
		name: 'extracts a single output PDF containing exactly the selected, deduplicated pages in order',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(10);
			const output = await runExtractPages(pdf, '2,4-6');

			assert.equal(output.json.pageCount, 4, 'selection "2,4-6" is 4 pages (2,4,5,6)');
			assert.equal(output.pairedItem, 0);

			const buffer = decodeOutputPdfBuffer(output);
			const loaded = await PDFDocument.load(buffer);
			const originalPageNumbers = loaded.getPages().map((page) => pageNumberFromWidth(page.getWidth()));
			assert.deepEqual(originalPageNumbers, [2, 4, 5, 6]);
		},
	},
	{
		name: 'overlapping ranges are deduplicated rather than duplicating pages in the output',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(6);
			const output = await runExtractPages(pdf, '1-3,2-4');
			assert.equal(output.json.pageCount, 4, '"1-3,2-4" covers pages 1,2,3,4 with no duplicates');
		},
	},
];
