/**
 * Shared minimal `IExecuteFunctions` mock used by every `tests/ops/*.test.mjs`
 * file, so op tests don't each reimplement it.
 *
 * This mock implements only what `PdfToolkit.node.ts`'s `execute()` and the
 * per-operation functions under `nodes/PdfToolkit/resources/**` actually
 * touch: `getInputData`, `getNodeParameter`, `getNode`, `continueOnFail`, and
 * `helpers.{assertBinaryData, getBinaryDataBuffer, prepareBinaryData}`.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// n8n-workflow's published ESM build has a broken internal import
// (`logger-proxy` missing its extension), so every test file resolves it via
// `require()` (the CJS build), not a top-level `import`.
const require = createRequire(import.meta.url);
const { NodeOperationError } = require('n8n-workflow');

export const dummyNode = {
	id: '1',
	name: 'PDF Toolkit',
	type: 'pdfToolkit',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * @param {Array<{ json: object, binary?: Record<string, { buffer: Buffer }> }>} items
 * @param {object} params - flat map of parameter name -> value, read
 *   regardless of itemIndex (sufficient for these single-call, single- or
 *   few-item test scenarios — real n8n reads params per item/expression).
 * @param {object} [overrides] - optional overrides for `continueOnFail`.
 */
export function createMockExecuteFunctions(items, params, overrides = {}) {
	return {
		getInputData(itemIndex) {
			return itemIndex === undefined ? items : [items[itemIndex]];
		},
		getNodeParameter(name, _itemIndex, fallback) {
			return name in params ? params[name] : fallback;
		},
		getNode() {
			return dummyNode;
		},
		continueOnFail() {
			return overrides.continueOnFail ?? false;
		},
		helpers: {
			assertBinaryData(itemIndex, propertyName) {
				const binaryData = items[itemIndex]?.binary?.[propertyName];
				if (!binaryData) {
					throw new NodeOperationError(
						dummyNode,
						`No binary data property "${propertyName}" exists on item index ${itemIndex}`,
						{ itemIndex },
					);
				}
				return binaryData;
			},
			async getBinaryDataBuffer(itemIndex, propertyName) {
				const binaryData = items[itemIndex]?.binary?.[propertyName];
				if (!binaryData) {
					throw new Error(`No binary data property "${propertyName}" on item index ${itemIndex}`);
				}
				return binaryData.buffer;
			},
			async prepareBinaryData(buffer, fileName, mimeType) {
				return {
					data: buffer.toString('base64'),
					fileName,
					mimeType,
					fileSize: `${buffer.length} bytes`,
				};
			},
		},
	};
}

/** Wraps a PDF buffer as an n8n item with a single named binary property. */
export function itemWithPdf(buffer, propertyName = 'data') {
	return { json: {}, binary: { [propertyName]: { buffer } } };
}

/**
 * Wraps several buffers as ONE n8n item with multiple named binary
 * properties — needed by ops that consume two binaries on the same item
 * (Stamp > Image Watermark's base PDF + watermark image, Stamp > Overlay
 * PDF's base + overlay PDF).
 */
export function itemWithBinaries(buffersByPropertyName) {
	const binary = {};
	for (const [propertyName, buffer] of Object.entries(buffersByPropertyName)) {
		binary[propertyName] = { buffer };
	}
	return { json: {}, binary };
}

/** Decodes an output item's binary property back into a real Buffer. */
export function decodeOutputPdfBuffer(outputItem, propertyName = 'data') {
	const b64 = outputItem.binary?.[propertyName]?.data;
	assert.ok(b64, `expected output binary property "${propertyName}" to be set`);
	return Buffer.from(b64, 'base64');
}
