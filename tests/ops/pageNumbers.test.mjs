/**
 * Stamp > Page Numbers: adds a formatted page-number label to every page.
 * Page count must stay unchanged; every page's content stream
 * must grow (a label was really drawn on it) — same honest content-stream
 * assertion as the watermark tests (`tests/pdf-content.mjs`), plus checking
 * (via `extractDrawnText`) that each page's EXPECTED label text was really
 * drawn (so "page 2 of 3" isn't just "some text", it's specifically the
 * right label per page).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { extractDrawnText, getPageContentBytes } from '../pdf-content.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function runPageNumbers(buffer, options = {}) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'stamp',
		operation: 'pageNumbers',
		binaryPropertyName: 'data',
		options,
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1);
	const buf = decodeOutputPdfBuffer(returnData[0]);
	return { json: returnData[0].json, pdf: await PDFDocument.load(buf) };
}

export const tests = [
	{
		name: 'stamps the default "Page {page} of {pages}" label on every page, page count unchanged',
		fn: async () => {
			const original = await makeDistinguishablePdf(3);
			const originalPdf = await PDFDocument.load(original);
			const originalLengths = [0, 1, 2].map(
				(index) => getPageContentBytes(originalPdf, index).length,
			);

			const { json, pdf: numbered } = await runPageNumbers(original);
			assert.equal(json.pageCount, 3);
			assert.equal(json.numberedPageCount, 3);
			assert.equal(numbered.getPageCount(), 3, 'page numbering must not change the page count');

			for (let index = 0; index < 3; index++) {
				const stampedLength = getPageContentBytes(numbered, index).length;
				assert.ok(stampedLength > originalLengths[index], `page ${index} content stream must grow`);

				const expectedLabel = `Page ${index + 1} of 3`;
				const drawnText = extractDrawnText(numbered, index);
				assert.ok(
					drawnText.includes(expectedLabel),
					`page ${index} must contain its own label "${expectedLabel}", got: ${drawnText}`,
				);
			}
		},
	},
	{
		name: 'a custom format template and start number are honored',
		fn: async () => {
			const original = await makeDistinguishablePdf(2);
			const { pdf: numbered } = await runPageNumbers(original, {
				format: '{page}/{pages}',
				startNumber: 5,
			});

			assert.ok(extractDrawnText(numbered, 0).includes('5/2'));
			assert.ok(extractDrawnText(numbered, 1).includes('6/2'));
		},
	},
	{
		// Regression test for the reported bug: a format string containing a
		// Latin Extended-A character ("ł") used to throw "WinAnsi cannot
		// encode ł" via pdf-lib's standard Helvetica font.
		name: 'a format string containing "ł" ("Strona {page} z {total} ł") does not throw and is drawn',
		fn: async () => {
			const original = await makeDistinguishablePdf(1);
			const originalPdf = await PDFDocument.load(original);
			const originalLength = getPageContentBytes(originalPdf, 0).length;

			const { pdf: numbered } = await runPageNumbers(original, { format: 'Strona {page} z {pages} ł' });
			assert.ok(getPageContentBytes(numbered, 0).length > originalLength);
			assert.ok(extractDrawnText(numbered, 0).includes('Strona 1 z 1 ł'));
		},
	},
];
