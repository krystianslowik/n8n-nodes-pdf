/**
 * Stamp > Text Watermark: text, position, opacity, rotation, font size,
 * applied to all pages or a range.
 *
 * pdf-lib cannot extract rendered text (see `tests/pdf-content.mjs`), so
 * these tests assert two honest, structural things instead: (1) each
 * stamped page's content stream grew (drawing operators were really added),
 * and (2) the hex-encoded operand of the watermark text is present in that
 * page's decoded content stream (the text was really drawn, not just
 * "some content" added) — NOT that a human would see the text rendered a
 * particular way on screen.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { getPageContentBytes, getPageContentText, textToHexOperand } from '../pdf-content.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function runTextWatermark(buffer, params) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'stamp',
		operation: 'textWatermark',
		binaryPropertyName: 'data',
		pageRanges: 'all',
		options: {},
		...params,
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1);
	const buf = decodeOutputPdfBuffer(returnData[0]);
	return { json: returnData[0].json, pdf: await PDFDocument.load(buf) };
}

export const tests = [
	{
		name: 'stamps the marker text onto every page by default, growing each content stream',
		fn: async () => {
			const original = await makeDistinguishablePdf(3);
			const originalPdf = await PDFDocument.load(original);
			const originalLengths = [0, 1, 2].map(
				(index) => getPageContentBytes(originalPdf, index).length,
			);

			const { json, pdf: stamped } = await runTextWatermark(original, {
				text: 'CONFIDENTIAL',
				options: { position: 'center', opacity: 0.5, rotation: 45, fontSize: 36 },
			});
			assert.equal(json.pageCount, 3);
			assert.equal(json.stampedPageCount, 3);
			assert.equal(stamped.getPageCount(), 3, 'watermarking must not change the page count');

			const hexMarker = textToHexOperand('CONFIDENTIAL');
			for (let index = 0; index < 3; index++) {
				const stampedLength = getPageContentBytes(stamped, index).length;
				assert.ok(
					stampedLength > originalLengths[index],
					`page ${index} content stream must grow after stamping`,
				);
				const text = getPageContentText(stamped, index);
				assert.ok(
					text.toUpperCase().includes(hexMarker),
					`page ${index} content stream must contain the watermark text's drawn operand`,
				);
			}
		},
	},
	{
		name: 'a page-range expression stamps only the selected pages',
		fn: async () => {
			const original = await makeDistinguishablePdf(4);
			const { json, pdf: stamped } = await runTextWatermark(original, {
				text: 'DRAFT',
				pageRanges: '2',
			});
			assert.equal(json.stampedPageCount, 1);

			const hexMarker = textToHexOperand('DRAFT');
			const page1Text = getPageContentText(stamped, 0);
			const page2Text = getPageContentText(stamped, 1);
			assert.ok(!page1Text.toUpperCase().includes(hexMarker), 'page 1 must NOT be stamped');
			assert.ok(page2Text.toUpperCase().includes(hexMarker), 'page 2 must be stamped');
		},
	},
];
