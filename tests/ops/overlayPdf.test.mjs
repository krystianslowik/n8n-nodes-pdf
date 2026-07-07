/**
 * Stamp > Overlay PDF: overlays the first page (repeated) or matching pages
 * of a second PDF onto the target, via `PDFDocument.embedPdf()` (a thin
 * wrapper around pdf-lib's `embedPage`/`embedPages`) + `page.drawPage()`.
 * Asserts page count unchanged + content-stream growth on
 * every affected page (same honest, structural check as the other Stamp
 * tests — see `tests/pdf-content.mjs`).
 *
 * Uses `makePdf` (real `drawText`-authored content streams), not
 * `makeDistinguishablePdf` (blank pages with no Contents at all) — pdf-lib's
 * `embedPage`/`embedPdf` reject a page with no Contents entry.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithBinaries } from '../mock-execute.mjs';
import { makePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { getPageContentBytes } from '../pdf-content.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function runOverlay(baseBuffer, overlayBuffer, params) {
	const items = [itemWithBinaries({ data: baseBuffer, overlay: overlayBuffer })];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'stamp',
		operation: 'overlayPdf',
		binaryPropertyName: 'data',
		overlayBinaryPropertyName: 'overlay',
		overlayMode: 'firstPage',
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
		name: '"firstPage" mode overlays the overlay PDF\'s first page onto EVERY base page',
		fn: async () => {
			const base = await makePdf(3, 'Base');
			const basePdf = await PDFDocument.load(base);
			const originalLengths = [0, 1, 2].map((index) => getPageContentBytes(basePdf, index).length);

			const overlay = await makePdf(1, 'Overlay');
			const { json, pdf: overlaid } = await runOverlay(base, overlay, { overlayMode: 'firstPage' });

			assert.equal(json.pageCount, 3);
			assert.equal(json.overlaidPageCount, 3);
			assert.equal(overlaid.getPageCount(), 3, 'overlay must not change the base page count');

			for (let index = 0; index < 3; index++) {
				assert.ok(
					getPageContentBytes(overlaid, index).length > originalLengths[index],
					`page ${index} content stream must grow after overlay`,
				);
			}
		},
	},
	{
		name: '"matchingPages" mode overlays page N onto page N, up to the shorter document\'s length',
		fn: async () => {
			const base = await makePdf(3, 'Base');
			const basePdf = await PDFDocument.load(base);
			const originalLengths = [0, 1, 2].map((index) => getPageContentBytes(basePdf, index).length);

			const overlay = await makePdf(2, 'Overlay'); // shorter than base
			const { json, pdf: overlaid } = await runOverlay(base, overlay, {
				overlayMode: 'matchingPages',
			});

			assert.equal(json.overlaidPageCount, 2, 'only min(3, 2) = 2 pages should be overlaid');
			assert.ok(getPageContentBytes(overlaid, 0).length > originalLengths[0], 'page 1 overlaid');
			assert.ok(getPageContentBytes(overlaid, 1).length > originalLengths[1], 'page 2 overlaid');
			assert.equal(
				getPageContentBytes(overlaid, 2).length,
				originalLengths[2],
				'page 3 (no matching overlay page) must be untouched',
			);
		},
	},
];
