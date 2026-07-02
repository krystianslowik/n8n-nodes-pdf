/**
 * Extract > Page Count. Ports the third case from `spike/harness.mjs` (kept
 * there, untouched, as historical spike evidence) into the shared test
 * structure.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, itemWithPdf } from '../mock-execute.mjs';
import { makePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { NodeOperationError } = require('n8n-workflow');

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
	{
		// Regression test for the audit finding that Page Count called raw
		// `PDFDocument.load()` instead of the shared `loadPdfDocument` helper,
		// so it had NO PRD R2 100MB guard: a >100MB buffer used to crash inside
		// pdf-lib with an unrelated error ("Cannot read properties of undefined
		// (reading 'Pages')") instead of a clear, property-naming error.
		name: 'a binary over the 100MB limit is refused with a clear error naming the property, not a raw pdf-lib crash',
		fn: async () => {
			const oversized = Buffer.alloc(100 * 1024 * 1024 + 1);
			const items = [itemWithPdf(oversized)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'extract',
				operation: 'pageCount',
				binaryPropertyName: 'data',
			});

			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error instanceof NodeOperationError, `expected a NodeOperationError, got ${error}`);
					assert.ok(
						/"data"/.test(error.message) && /100MB/.test(error.message),
						`expected message to name the binary property and the 100MB limit, got: ${error.message}`,
					);
					assert.equal(error.context?.itemIndex, 0);
					return true;
				},
			);
		},
	},
	{
		// Regression test for the audit finding that a corrupt/non-PDF buffer
		// used to surface pdf-lib's raw, unwrapped parser message instead of a
		// clear error naming the failing binary property/item.
		name: 'a corrupt (non-PDF) binary throws a clear error naming the property, not a raw pdf-lib parser message',
		fn: async () => {
			const corrupt = Buffer.from('this is definitely not a PDF file');
			const items = [itemWithPdf(corrupt)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'extract',
				operation: 'pageCount',
				binaryPropertyName: 'data',
			});

			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error instanceof NodeOperationError, `expected a NodeOperationError, got ${error}`);
					assert.ok(
						/Could not read binary property "data" as a PDF file/.test(error.message),
						`expected wrapped, property-naming message, got: ${error.message}`,
					);
					assert.equal(error.context?.itemIndex, 0);
					return true;
				},
			);
		},
	},
];
