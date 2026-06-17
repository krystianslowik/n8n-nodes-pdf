/**
 * Document > Split (PRD F2): one output item per comma-separated range.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');
const { NodeOperationError } = require('n8n-workflow');

async function runSplit(buffer, pageRanges, itemIndex = 0, extraParams = {}) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'document',
		operation: 'split',
		binaryPropertyName: 'data',
		pageRanges,
		options: {},
		...extraParams,
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	return returnData;
}

export const tests = [
	{
		name: '"1-3,7,9-" on a 10-page document produces 3 output items with correct page counts',
		fn: async () => {
			const pdf = await makePdf(10, 'Doc');
			const outputs = await runSplit(pdf, '1-3,7,9-');

			assert.equal(outputs.length, 3, 'expected 1 output item per comma-separated range');
			assert.equal(outputs[0].json.pageCount, 3, 'range "1-3" must produce a 3-page PDF');
			assert.equal(outputs[1].json.pageCount, 1, 'range "7" must produce a 1-page PDF');
			assert.equal(outputs[2].json.pageCount, 2, 'range "9-" must produce a 2-page PDF (pages 9-10)');

			for (const output of outputs) {
				assert.equal(output.pairedItem, 0, 'every output item must be paired back to the source item');
				const buffer = decodeOutputPdfBuffer(output);
				const loaded = await PDFDocument.load(buffer);
				assert.equal(loaded.getPageCount(), output.json.pageCount);
			}
		},
	},
	{
		name: 'a single range produces exactly 1 output item',
		fn: async () => {
			const pdf = await makePdf(5, 'Doc');
			const outputs = await runSplit(pdf, '2-4');
			assert.equal(outputs.length, 1);
			assert.equal(outputs[0].json.pageCount, 3);
		},
	},
	{
		name: 'an out-of-range page throws a NodeOperationError naming the document\'s real page count',
		fn: async () => {
			const pdf = await makePdf(3, 'Doc');
			await assert.rejects(() => runSplit(pdf, '1-5'), (error) => {
				assert.ok(error instanceof NodeOperationError);
				assert.ok(error.message.includes('3'), `expected error to mention page count 3, got: ${error.message}`);
				return true;
			});
		},
	},
];
