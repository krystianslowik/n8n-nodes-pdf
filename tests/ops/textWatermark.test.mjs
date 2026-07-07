/**
 * Stamp > Text Watermark: text, position, opacity, rotation, font size,
 * applied to all pages or a range.
 *
 * pdf-lib cannot extract rendered text, so these tests assert two honest,
 * structural things instead: (1) each stamped page's content stream grew
 * (drawing operators were really added), and (2) `extractDrawnText` (see
 * `tests/pdf-content.mjs`) — which reverses the embedded custom font's glyph
 * IDs back to Unicode text via its `ToUnicode` CMap — reports the watermark
 * text present on that page (the text was really drawn, not just "some
 * content" added) — NOT that a human would see the text rendered a
 * particular way on screen.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { extractDrawnText, getPageContentBytes } from '../pdf-content.mjs';

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

			for (let index = 0; index < 3; index++) {
				const stampedLength = getPageContentBytes(stamped, index).length;
				assert.ok(
					stampedLength > originalLengths[index],
					`page ${index} content stream must grow after stamping`,
				);
				const drawnText = extractDrawnText(stamped, index);
				assert.ok(
					drawnText.includes('CONFIDENTIAL'),
					`page ${index} content stream must contain the watermark text's drawn operand, got: ${drawnText}`,
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

			const page1Text = extractDrawnText(stamped, 0);
			const page2Text = extractDrawnText(stamped, 1);
			assert.ok(!page1Text.includes('DRAFT'), 'page 1 must NOT be stamped');
			assert.ok(page2Text.includes('DRAFT'), 'page 2 must be stamped');
		},
	},
	{
		// Regression test for the reported bug ("WinAnsi cannot encode ł") plus
		// emoji support — `shared/fonts.ts`'s bundled Noto Sans/Noto Emoji
		// faces, not pdf-lib's WinAnsi-only Helvetica.
		name: 'Polish text with an emoji ("Słowik ✅") does not throw and is drawn',
		fn: async () => {
			const original = await makeDistinguishablePdf(1);
			const originalPdf = await PDFDocument.load(original);
			const originalLength = getPageContentBytes(originalPdf, 0).length;

			const { pdf: stamped } = await runTextWatermark(original, { text: 'Słowik ✅' });
			const stampedLength = getPageContentBytes(stamped, 0).length;
			assert.ok(stampedLength > originalLength, 'content stream must grow after stamping');

			const drawnText = extractDrawnText(stamped, 0);
			assert.ok(drawnText.includes('Słowik'), drawnText);
			assert.ok(drawnText.includes('✅'), drawnText);
		},
	},
];
