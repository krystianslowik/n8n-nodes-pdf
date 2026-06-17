/**
 * Document > Reorder: new page order from a ranges/list expression (e.g.
 * "3,1,2"), validated as a complete permutation of the document's pages.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf, pageNumberFromWidth } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');
const { NodeOperationError } = require('n8n-workflow');

async function runReorder(buffer, newOrder) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'document',
		operation: 'reorder',
		binaryPropertyName: 'data',
		newOrder,
		options: {},
	});
	return createPdfToolkitInstance().execute.call(mockThis);
}

export const tests = [
	{
		name: '"3,1,2,4" reorders a 4-page document so page 3 comes first',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(4);
			const [returnData] = await runReorder(pdf, '3,1,2,4');
			assert.equal(returnData.length, 1);

			const buffer = decodeOutputPdfBuffer(returnData[0]);
			const loaded = await PDFDocument.load(buffer);
			const originalPageNumbers = loaded.getPages().map((page) => pageNumberFromWidth(page.getWidth()));
			assert.deepEqual(originalPageNumbers, [3, 1, 2, 4]);
		},
	},
	{
		name: 'ranges are legal inside the new-order expression (e.g. "3,1-2,4")',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(4);
			const [returnData] = await runReorder(pdf, '3,1-2,4');
			const buffer = decodeOutputPdfBuffer(returnData[0]);
			const loaded = await PDFDocument.load(buffer);
			const originalPageNumbers = loaded.getPages().map((page) => pageNumberFromWidth(page.getWidth()));
			assert.deepEqual(originalPageNumbers, [3, 1, 2, 4]);
		},
	},
	{
		name: 'an incomplete order (missing a page) throws a NodeOperationError',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(4);
			await assert.rejects(() => runReorder(pdf, '1,2,3'), (error) => {
				assert.ok(error instanceof NodeOperationError);
				assert.ok(/every page must be listed exactly once/.test(error.message));
				return true;
			});
		},
	},
	{
		name: 'a duplicated page reference throws a NodeOperationError',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(4);
			await assert.rejects(() => runReorder(pdf, '1,1,2,4'), (error) => {
				assert.ok(error instanceof NodeOperationError);
				assert.ok(/more than once/.test(error.message));
				return true;
			});
		},
	},
];
