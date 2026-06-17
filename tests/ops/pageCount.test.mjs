/**
 * Extract > Page Count. Ports the third case from `spike/harness.mjs` (kept
 * there, untouched, as historical spike evidence) into the shared test
 * structure.
 */
import assert from 'node:assert/strict';

import { createMockExecuteFunctions, itemWithPdf } from '../mock-execute.mjs';
import { makePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

export const tests = [
	{
		name: 'returns the correct page count per item, for items with different page counts',
		fn: async () => {
			const pdfA = await makePdf(2, 'Doc A');
			const pdfB = await makePdf(3, 'Doc B');
			const pdf100 = await makePdf(100, 'Doc 100');
			const items = [itemWithPdf(pdfA), itemWithPdf(pdfB), itemWithPdf(pdf100)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'extract',
				operation: 'pageCount',
				binaryPropertyName: 'data',
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.equal(returnData.length, 3, 'pageCount must produce 1 output item per input item');
			assert.equal(returnData[0].json.pageCount, 2);
			assert.equal(returnData[1].json.pageCount, 3);
			assert.equal(returnData[2].json.pageCount, 100);
		},
	},
];
