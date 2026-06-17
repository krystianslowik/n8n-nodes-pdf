/**
 * Document > Rotate: rotate all pages (default) or a page range, by
 * 90/180/270/-90 degrees, added to each page's existing rotation.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { makeDistinguishablePdf } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function runRotate(buffer, { pageRanges = 'all', rotation = 90 } = {}) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'document',
		operation: 'rotate',
		binaryPropertyName: 'data',
		pageRanges,
		rotation,
		options: {},
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1);
	const buf = decodeOutputPdfBuffer(returnData[0]);
	return { json: returnData[0].json, pdf: await PDFDocument.load(buf) };
}

export const tests = [
	{
		name: '"all" (the default) rotates every page by the requested angle',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(3);
			const { json, pdf: rotated } = await runRotate(pdf, { pageRanges: 'all', rotation: 180 });
			assert.equal(json.rotatedPageCount, 3);
			for (const page of rotated.getPages()) {
				assert.equal(page.getRotation().angle, 180);
			}
		},
	},
	{
		name: 'a page-range expression rotates only the selected pages, leaving others at 0',
		fn: async () => {
			const pdf = await makeDistinguishablePdf(4);
			const { json, pdf: rotated } = await runRotate(pdf, { pageRanges: '2', rotation: 90 });
			assert.equal(json.rotatedPageCount, 1);
			const angles = rotated.getPages().map((page) => page.getRotation().angle);
			assert.deepEqual(angles, [0, 90, 0, 0]);
		},
	},
	{
		name: 'rotation is ADDED to a page\'s existing rotation, wrapping at 360',
		fn: async () => {
			const first = await runRotate(await makeDistinguishablePdf(1), { pageRanges: 'all', rotation: 270 });
			assert.equal(first.pdf.getPages()[0].getRotation().angle, 270);

			// Rotate the already-270°-rotated output by another 180° -> 90 (270+180=450 % 360).
			const alreadyRotatedBytes = Buffer.from(await first.pdf.save());
			const second = await runRotate(alreadyRotatedBytes, { pageRanges: 'all', rotation: 180 });
			assert.equal(second.pdf.getPages()[0].getRotation().angle, 90);
		},
	},
	{
		name: '-90 (counter-clockwise) normalizes to 270',
		fn: async () => {
			const { pdf: rotated } = await runRotate(await makeDistinguishablePdf(1), {
				pageRanges: 'all',
				rotation: -90,
			});
			assert.equal(rotated.getPages()[0].getRotation().angle, 270);
		},
	},
];
