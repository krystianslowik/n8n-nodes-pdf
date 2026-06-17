/**
 * Document > Merge. Ports the two cases from `spike/harness.mjs` (kept
 * there, untouched, as historical spike evidence) into the shared test
 * structure.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

export const tests = [
	{
		name: 'merges 2 small PDFs into 1 output item with the summed page count',
		fn: async () => {
			const pdfA = await makePdf(2, 'Doc A');
			const pdfB = await makePdf(3, 'Doc B');
			const items = [itemWithPdf(pdfA), itemWithPdf(pdfB)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'document',
				operation: 'merge',
				mergeFrom: 'allItems',
				binaryPropertyName: 'data',
				options: { outputBinaryPropertyName: 'data', outputFileName: 'merged.pdf' },
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.equal(returnData.length, 1, 'merge must produce exactly 1 output item');

			const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
			const outputPdf = await PDFDocument.load(outputBuffer);
			assert.equal(outputPdf.getPageCount(), 5, 'merged page count must equal 2 + 3');
			assert.equal(returnData[0].json.pageCount, 5);
		},
	},
	{
		name: 'merges a 2-page and a 100-page document without crashing',
		fn: async () => {
			const pdfA = await makePdf(2, 'Doc A');
			const pdf100 = await makePdf(100, 'Doc 100');
			const items = [itemWithPdf(pdfA), itemWithPdf(pdf100)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'document',
				operation: 'merge',
				mergeFrom: 'allItems',
				binaryPropertyName: 'data',
				options: { outputBinaryPropertyName: 'data', outputFileName: 'merged-large.pdf' },
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.equal(returnData.length, 1);

			const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
			const outputPdf = await PDFDocument.load(outputBuffer);
			assert.equal(outputPdf.getPageCount(), 102, 'merged page count must equal 2 + 100');
		},
	},
];
