/**
 * Stamp > Image Watermark: embeds a PNG/JPG binary onto every page (or a
 * page range), scaled/positioned/with opacity. Content-stream
 * growth is the honest assertion available (see `tests/pdf-content.mjs`);
 * additionally, the page's `/XObject` resource dict must gain an embedded
 * image entry, which IS a structural, unambiguous "an image was really
 * embedded on this page" check (unlike text, an embedded image XObject has
 * no meaningful "render it back to compare" alternative either way).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithBinaries } from '../mock-execute.mjs';
import { makeDistinguishablePdf, makeTinyPng } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { getPageContentBytes } from '../pdf-content.mjs';

const require = createRequire(import.meta.url);
const { NodeOperationError } = require('n8n-workflow');
const { PDFDocument, PDFName } = require('pdf-lib');

function pageHasImageXObject(pdf, pageIndex) {
	const page = pdf.getPages()[pageIndex];
	const resources = page.node.Resources();
	if (!resources) return false;
	const xObjectDict = resources.lookup(PDFName.of('XObject'));
	if (!xObjectDict) return false;
	return xObjectDict.keys().length > 0;
}

async function runImageWatermark(pdfBuffer, pngBuffer, params) {
	const items = [itemWithBinaries({ data: pdfBuffer, image: pngBuffer })];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'stamp',
		operation: 'imageWatermark',
		binaryPropertyName: 'data',
		imageBinaryPropertyName: 'image',
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
		name: 'embeds the PNG on every page by default, adding an XObject and growing the content stream',
		fn: async () => {
			const original = await makeDistinguishablePdf(2);
			const originalPdf = await PDFDocument.load(original);
			const originalLengths = [0, 1].map((index) => getPageContentBytes(originalPdf, index).length);

			const png = makeTinyPng();
			const { json, pdf: stamped } = await runImageWatermark(original, png, {
				options: { position: 'center', opacity: 0.4, scale: 30 },
			});
			assert.equal(json.pageCount, 2);
			assert.equal(json.stampedPageCount, 2);
			assert.equal(stamped.getPageCount(), 2);

			for (let index = 0; index < 2; index++) {
				assert.ok(
					getPageContentBytes(stamped, index).length > originalLengths[index],
					`page ${index} content stream must grow after image-stamping`,
				);
				assert.ok(pageHasImageXObject(stamped, index), `page ${index} must have an embedded image XObject`);
			}
		},
	},
	{
		name: 'a page-range expression stamps only the selected pages',
		fn: async () => {
			const original = await makeDistinguishablePdf(3);
			const png = makeTinyPng();
			const { json, pdf: stamped } = await runImageWatermark(original, png, { pageRanges: '1' });
			assert.equal(json.stampedPageCount, 1);
			assert.ok(pageHasImageXObject(stamped, 0), 'page 1 must be stamped');
			assert.ok(!pageHasImageXObject(stamped, 1), 'page 2 must NOT be stamped');
			assert.ok(!pageHasImageXObject(stamped, 2), 'page 3 must NOT be stamped');
		},
	},
	{
		// Regression test: the watermark IMAGE binary (unlike every other
		// binary read in the codebase) used to skip the shared
		// `assertBinarySizeWithinLimit` guard, so an oversized image buffer
		// went straight into `embedImageAuto`/pdf-lib's PNG decoder instead of
		// being refused up front with the 100MB-limit error message.
		name:
			'a watermark image over the 100MB limit is refused with a clear error naming the image binary property, not passed to the PNG decoder',
		fn: async () => {
			const original = await makeDistinguishablePdf(1);
			const oversizedImage = Buffer.alloc(100 * 1024 * 1024 + 1);
			const items = [itemWithBinaries({ data: original, image: oversizedImage })];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'stamp',
				operation: 'imageWatermark',
				binaryPropertyName: 'data',
				imageBinaryPropertyName: 'image',
				pageRanges: 'all',
				options: {},
			});

			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.ok(error instanceof NodeOperationError, `expected a NodeOperationError, got ${error}`);
					assert.ok(
						/"image"/.test(error.message) && /100MB/.test(error.message),
						`expected message to name the image binary property and the 100MB limit, got: ${error.message}`,
					);
					assert.equal(error.context?.itemIndex, 0);
					return true;
				},
			);
		},
	},
];
