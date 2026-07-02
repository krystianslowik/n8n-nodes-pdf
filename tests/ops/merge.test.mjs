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
const { NodeOperationError } = require('n8n-workflow');

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
	{
		// Regression test for the audit finding that Merge called raw
		// `PDFDocument.load()` per source instead of the shared
		// `loadPdfDocument` helper, so it had NO PRD R2 100MB guard on any of
		// its merge sources.
		name: 'a merge source over the 100MB limit is refused with a clear error naming the property and source item, not a raw pdf-lib crash',
		fn: async () => {
			const pdfA = await makePdf(2, 'Doc A');
			const oversized = Buffer.alloc(100 * 1024 * 1024 + 1);
			const items = [itemWithPdf(pdfA), itemWithPdf(oversized)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'document',
				operation: 'merge',
				mergeFrom: 'allItems',
				binaryPropertyName: 'data',
				options: { outputBinaryPropertyName: 'data', outputFileName: 'merged.pdf' },
			});

			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error instanceof NodeOperationError, `expected a NodeOperationError, got ${error}`);
					assert.ok(
						/"data"/.test(error.message) && /100MB/.test(error.message),
						`expected message to name the binary property and the 100MB limit, got: ${error.message}`,
					);
					assert.equal(error.context?.itemIndex, 1, 'must blame the oversized source item, not item 0');
					return true;
				},
			);
		},
	},
	{
		// Regression test for the audit finding that a corrupt merge source
		// used to surface pdf-lib's raw, unwrapped parser message instead of a
		// clear error naming the failing binary property/item.
		name: 'a corrupt (non-PDF) merge source throws a clear error naming the property and source item, not a raw pdf-lib parser message',
		fn: async () => {
			const pdfA = await makePdf(2, 'Doc A');
			const corrupt = Buffer.from('this is definitely not a PDF file');
			const items = [itemWithPdf(pdfA), itemWithPdf(corrupt)];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'document',
				operation: 'merge',
				mergeFrom: 'allItems',
				binaryPropertyName: 'data',
				options: { outputBinaryPropertyName: 'data', outputFileName: 'merged.pdf' },
			});

			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error instanceof NodeOperationError, `expected a NodeOperationError, got ${error}`);
					assert.ok(
						/Could not read binary property "data" as a PDF file/.test(error.message),
						`expected wrapped, property-naming message, got: ${error.message}`,
					);
					assert.equal(error.context?.itemIndex, 1, 'must blame the corrupt source item, not item 0');
					return true;
				},
			);
		},
	},
];
