/**
 * Extract > Embedded Images: walks every page's `/Resources /XObject`
 * dictionary and extracts each `/Subtype /Image` stream's raw bytes.
 * DCTDecode (JPEG) is the one supported filter (see the op's module doc
 * comment for why) — verified here by embedding a real JPEG via pdf-lib,
 * round-tripping it through save()/load(), and asserting the extracted
 * bytes are byte-identical to the original file.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, itemWithPdf } from '../mock-execute.mjs';
import { makeTinyJpg, makeTinyPng } from '../fixtures.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function runEmbeddedImages(buffer, params = {}) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'extract',
		operation: 'embeddedImages',
		binaryPropertyName: 'data',
		options: {},
		...params,
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1);
	return returnData[0];
}

export const tests = [
	{
		name: 'extracts a JPEG (DCTDecode) image byte-identical to the original file',
		fn: async () => {
			const jpgBytes = makeTinyJpg();
			const pdf = await PDFDocument.create();
			const image = await pdf.embedJpg(jpgBytes);
			const page = pdf.addPage([100, 100]);
			page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
			const pdfBuffer = Buffer.from(await pdf.save());

			const item = await runEmbeddedImages(pdfBuffer);
			assert.equal(item.json.imageCount, 1);
			assert.equal(item.json.images.length, 1);
			assert.deepEqual(item.json.images[0], {
				property: 'image0',
				page: 1,
				name: item.json.images[0].name,
				width: image.width,
				height: image.height,
			});

			const extractedBase64 = item.binary.image0.data;
			const extractedBuffer = Buffer.from(extractedBase64, 'base64');
			assert.equal(Buffer.compare(extractedBuffer, jpgBytes), 0, 'extracted bytes must match the original JPEG exactly');
			assert.equal(item.binary.image0.mimeType, 'image/jpeg');
			assert.equal(item.binary.image0.fileName, 'image0.jpg');
		},
	},
	{
		name: 'a PDF with two JPEGs on different pages extracts both, using the configured prefix',
		fn: async () => {
			const jpgBytes = makeTinyJpg();
			const pdf = await PDFDocument.create();
			const image1 = await pdf.embedJpg(jpgBytes);
			const image2 = await pdf.embedJpg(jpgBytes);
			const page1 = pdf.addPage([100, 100]);
			page1.drawImage(image1, { x: 0, y: 0, width: 50, height: 50 });
			const page2 = pdf.addPage([100, 100]);
			page2.drawImage(image2, { x: 0, y: 0, width: 50, height: 50 });
			const pdfBuffer = Buffer.from(await pdf.save());

			const item = await runEmbeddedImages(pdfBuffer, { options: { outputBinaryPropertyPrefix: 'pic' } });
			assert.equal(item.json.imageCount, 2);
			assert.ok(item.binary.pic0, 'expected a "pic0" binary field');
			assert.ok(item.binary.pic1, 'expected a "pic1" binary field');
			assert.deepEqual(
				item.json.images.map((entry) => entry.page),
				[1, 2],
			);
		},
	},
	{
		name: 'a PDF with no embedded images returns zero images and empty binary, not an error',
		fn: async () => {
			const pdf = await PDFDocument.create();
			pdf.addPage([100, 100]);
			const pdfBuffer = Buffer.from(await pdf.save());

			const item = await runEmbeddedImages(pdfBuffer);
			assert.equal(item.json.imageCount, 0);
			assert.deepEqual(item.json.images, []);
			assert.deepEqual(item.binary, {});
		},
	},
	{
		name: 'a PDF with a PNG-filter (FlateDecode) image throws a clear error naming the unsupported filter',
		fn: async () => {
			const png = makeTinyPng();
			const pdf = await PDFDocument.create();
			const image = await pdf.embedPng(png);
			const page = pdf.addPage([100, 100]);
			page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
			const pdfBuffer = Buffer.from(await pdf.save());

			await assert.rejects(
				() => runEmbeddedImages(pdfBuffer),
				(error) => {
					assert.match(error.message, /FlateDecode/);
					assert.match(error.message, /not supported/i);
					return true;
				},
			);
		},
	},
];
