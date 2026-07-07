/**
 * Stamp > Page Numbers: adds a formatted page-number label to every page.
 * Page count must stay unchanged; every page's content stream
 * must grow (a label was really drawn on it) — same honest content-stream
 * assertion as the watermark tests (`tests/pdf-content.mjs`), plus checking
 * the hex-encoded operand of each page's EXPECTED label text (so "page 2 of
 * 3" isn't just "some text", it's specifically the right label per page).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { getPageContentBytes, getPageContentText, textToHexOperand } from '../pdf-content.mjs';

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
				const hexMarker = textToHexOperand(expectedLabel);
				const text = getPageContentText(numbered, index);
				assert.ok(
					text.toUpperCase().includes(hexMarker),
					`page ${index} must contain its own label "${expectedLabel}"`,
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

			const hexMarkerFirst = textToHexOperand('5/2');
			const hexMarkerSecond = textToHexOperand('6/2');
			assert.ok(getPageContentText(numbered, 0).toUpperCase().includes(hexMarkerFirst));
			assert.ok(getPageContentText(numbered, 1).toUpperCase().includes(hexMarkerSecond));
		},
	},
];
