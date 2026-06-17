/**
 * Document > Delete Pages: remove pages by range, highest-index-first so
 * earlier removals don't shift the indices of pages not yet removed.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf, pageNumberFromWidth } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');
const { NodeOperationError } = require('n8n-workflow');

async function runDeletePages(buffer, pageRanges) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'document',
		operation: 'deletePages',
		binaryPropertyName: 'data',
		pageRanges,
		options: {},
	});
	return createPdfToolkitInstance().execute.call(mockThis);
}

export const tests = [
	{
		name: 'deletes the selected pages, leaving the rest in their original relative order',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(5);
			const [returnData] = await runDeletePages(pdf, '2,4');
			assert.equal(returnData.length, 1);
			assert.equal(returnData[0].json.pageCount, 3, '5 pages minus 2 deleted = 3 remaining');

			const buffer = decodeOutputPdfBuffer(returnData[0]);
			const loaded = await PDFDocument.load(buffer);
			const originalPageNumbers = loaded.getPages().map((page) => pageNumberFromWidth(page.getWidth()));
			assert.deepEqual(originalPageNumbers, [1, 3, 5], 'pages 1, 3, 5 must survive, in order');
		},
	},
	{
		name: 'deleting an open-ended range removes from that page to the end',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(6);
			const [returnData] = await runDeletePages(pdf, '4-');
			assert.equal(returnData[0].json.pageCount, 3);
			const buffer = decodeOutputPdfBuffer(returnData[0]);
			const loaded = await PDFDocument.load(buffer);
			const originalPageNumbers = loaded.getPages().map((page) => pageNumberFromWidth(page.getWidth()));
			assert.deepEqual(originalPageNumbers, [1, 2, 3]);
		},
	},
	{
		name: 'deleting every page throws a NodeOperationError instead of producing an empty PDF',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(3);
			await assert.rejects(() => runDeletePages(pdf, '1-3'), (error) => {
				assert.ok(error instanceof NodeOperationError);
				assert.ok(/would remove all/.test(error.message));
				return true;
			});
		},
	},
];
