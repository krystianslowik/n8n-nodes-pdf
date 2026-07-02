/**
 * Generate > From Images (PRD F7, the n8n-nodes-pdfkit parity op).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer } from '../mock-execute.mjs';
import { makeTinyJpg, makeTinyPng } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

export const tests = [
	{
		name: '2 PNGs + 1 JPG produce a 3-page PDF, one page per image, in input order',
		fn: async () => {
			const png = makeTinyPng(); // 1x1
			const jpg = makeTinyJpg(); // 4x4
			const items = [
				{ json: {}, binary: { data: { buffer: png } } },
				{ json: {}, binary: { data: { buffer: png } } },
				{ json: {}, binary: { data: { buffer: jpg } } },
			];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromImages',
				binaryPropertyName: 'data',
				pageSize: 'fit',
				options: { outputBinaryPropertyName: 'data', outputFileName: 'images.pdf' },
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.equal(returnData.length, 1, 'From Images must produce exactly 1 output item');
			assert.equal(returnData[0].json.pageCount, 3);

			const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
			const outputPdf = await PDFDocument.load(outputBuffer);
			assert.equal(outputPdf.getPageCount(), 3);

			const pages = outputPdf.getPages();
			// "Fit to Image" page size: the page IS the image, at its natural
			// pixel dimensions (1px = 1pt) — a real, structural dimension check,
			// not just "did it not throw".
			assert.deepEqual(pages[0].getSize(), { width: 1, height: 1 });
			assert.deepEqual(pages[1].getSize(), { width: 1, height: 1 });
			assert.deepEqual(pages[2].getSize(), { width: 4, height: 4 });
		},
	},
	{
		name: '"A4" page size mode produces A4-sized pages regardless of the source image dimensions',
		fn: async () => {
			const png = makeTinyPng();
			const items = [{ json: {}, binary: { data: { buffer: png } } }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromImages',
				binaryPropertyName: 'data',
				pageSize: 'a4',
				options: {},
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			const { width, height } = outputPdf.getPages()[0].getSize();
			assert.equal(width, 595.28);
			assert.equal(height, 841.89);
		},
	},
	{
		name: 'throws a clear error naming the missing binary property when an item lacks it, instead of a raw library crash',
		fn: async () => {
			const png = makeTinyPng();
			const items = [
				{ json: {}, binary: { data: { buffer: png } } },
				{ json: {} }, // no "data" binary on this item
			];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromImages',
				binaryPropertyName: 'data',
				pageSize: 'fit',
				options: {},
			});
			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error.message.includes('data'), `expected error to name the binary property, got: ${error.message}`);
					return true;
				},
			);
		},
	},
];
