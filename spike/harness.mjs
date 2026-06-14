#!/usr/bin/env node
/**
 * Standalone spike harness (branch spike/esbuild-bundling, PRD Milestone 1 —
 * "memory test with 100-page docs on task runners").
 *
 * This does NOT start n8n. It requires the actual BUNDLED build output
 * (`dist/nodes/PdfToolkit/PdfToolkit.node.js` — the esbuild-bundled artifact
 * that `npm run build` produces) and drives its real `execute()` method with
 * a minimal, hand-rolled `IExecuteFunctions` mock — proving Q3 ("do real
 * operations work in-process?") against the exact same artifact that Q1
 * proved has zero runtime dependencies.
 *
 * Run with: `timeout 300 node spike/harness.mjs < /dev/null`
 * Requires `npm run build` to have been run first (dist/ must exist).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const distEntry = path.join(__dirname, '..', 'dist', 'nodes', 'PdfToolkit', 'PdfToolkit.node.js');
let PdfToolkit;
try {
	({ PdfToolkit } = require(distEntry));
} catch (error) {
	console.error(
		`[harness] Could not load ${distEntry}. Run "npm run build" first (this harness exercises the bundled dist output, not the TS source).`,
	);
	throw error;
}

const { PDFDocument } = require('pdf-lib');
const { NodeOperationError } = require('n8n-workflow');

// ---------------------------------------------------------------------------
// 1. Generate test PDFs with the bundled pdf-lib (same library the dist
//    build inlines) — two small ones, plus one 100-page document for the
//    PRD R2 ("100-page/50MB docs") memory check.
// ---------------------------------------------------------------------------

async function makePdf(pageCount, label) {
	const pdf = await PDFDocument.create();
	const font = await pdf.embedFont('Helvetica');
	for (let i = 0; i < pageCount; i++) {
		const page = pdf.addPage([300, 200]);
		page.drawText(`${label} — page ${i + 1}/${pageCount}`, {
			x: 20,
			y: 100,
			size: 12,
			font,
		});
	}
	return Buffer.from(await pdf.save());
}

console.log('[harness] Generating test PDFs...');
const pdfA = await makePdf(2, 'Doc A');
const pdfB = await makePdf(3, 'Doc B');
const pdf100 = await makePdf(100, 'Doc 100');
console.log(
	`[harness] Generated: Doc A (2p, ${pdfA.length}B), Doc B (3p, ${pdfB.length}B), Doc 100 (100p, ${pdf100.length}B)`,
);

// ---------------------------------------------------------------------------
// 2. Minimal IExecuteFunctions mock — only what Document>Merge and
//    Extract>Page Count touch: getInputData, getNodeParameter,
//    helpers.assertBinaryData/getBinaryDataBuffer/prepareBinaryData,
//    getNode, continueOnFail.
// ---------------------------------------------------------------------------

const dummyNode = { name: 'PDF Toolkit', type: 'pdfToolkit', typeVersion: 1, parameters: {} };

/**
 * @param {Array<{ json: object, binary?: Record<string, Buffer> }>} items
 * @param {object} params - flat map of parameter name -> value, read
 *   regardless of itemIndex (sufficient for this harness's single-call runs).
 */
function createMockExecuteFunctions(items, params) {
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
			return false;
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

function itemWithPdf(buffer, propertyName = 'data') {
	return { json: {}, binary: { [propertyName]: { buffer } } };
}

function decodeOutputPdfBuffer(outputItem, propertyName = 'data') {
	const b64 = outputItem.binary?.[propertyName]?.data;
	assert.ok(b64, `expected output binary property "${propertyName}" to be set`);
	return Buffer.from(b64, 'base64');
}

// RSS sampler: polls process.memoryUsage().rss while an async op runs, so we
// get a real peak rather than just a before/after snapshot (PRD R2: "memory
// blowups on large PDFs crash instances" is the risk this de-risks).
async function withRssSampling(label, fn) {
	let peakRss = process.memoryUsage().rss;
	const interval = setInterval(() => {
		const rss = process.memoryUsage().rss;
		if (rss > peakRss) peakRss = rss;
	}, 5);
	const rssBefore = process.memoryUsage().rss;
	const start = Date.now();
	try {
		const result = await fn();
		const durationMs = Date.now() - start;
		clearInterval(interval);
		const rssAfter = process.memoryUsage().rss;
		if (rssAfter > peakRss) peakRss = rssAfter;
		console.log(
			`[harness] ${label}: ${durationMs}ms, RSS before=${(rssBefore / 1024 / 1024).toFixed(1)}MB ` +
				`after=${(rssAfter / 1024 / 1024).toFixed(1)}MB peak=${(peakRss / 1024 / 1024).toFixed(1)}MB`,
		);
		return { result, peakRss, rssBefore, rssAfter, durationMs };
	} catch (error) {
		clearInterval(interval);
		throw error;
	}
}

const instance = new PdfToolkit();
let failures = 0;

// ---------------------------------------------------------------------------
// Test 1: Merge of 2 small PDFs -> 1 output item, correct page sum.
// ---------------------------------------------------------------------------
try {
	console.log('\n[harness] Test 1: Document > Merge (2 small PDFs)');
	const items = [itemWithPdf(pdfA), itemWithPdf(pdfB)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'document',
		operation: 'merge',
		mergeFrom: 'allItems',
		binaryPropertyName: 'data',
		options: { outputBinaryPropertyName: 'data', outputFileName: 'merged.pdf' },
	});

	const { result } = await withRssSampling('merge(2 small PDFs)', () => instance.execute.call(mockThis));
	const [returnData] = result;
	assert.equal(returnData.length, 1, 'merge must produce exactly 1 output item');

	const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
	const outputPdf = await PDFDocument.load(outputBuffer);
	assert.equal(outputPdf.getPageCount(), 2 + 3, 'merged page count must equal sum of inputs (2 + 3)');
	assert.equal(returnData[0].json.pageCount, 5, 'returned json.pageCount must match merged page count');

	console.log('[harness] Test 1 PASSED: 1 output item, 5 pages (2 + 3), page count matches json.pageCount');
} catch (error) {
	failures++;
	console.error('[harness] Test 1 FAILED:', error);
}

// ---------------------------------------------------------------------------
// Test 2: Merge including the 100-page doc -> completes, correct page sum,
// report peak RSS (PRD R2 memory concern).
// ---------------------------------------------------------------------------
try {
	console.log('\n[harness] Test 2: Document > Merge (2-page doc + 100-page doc)');
	const items = [itemWithPdf(pdfA), itemWithPdf(pdf100)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'document',
		operation: 'merge',
		mergeFrom: 'allItems',
		binaryPropertyName: 'data',
		options: { outputBinaryPropertyName: 'data', outputFileName: 'merged-large.pdf' },
	});

	const { result, peakRss } = await withRssSampling('merge(2p + 100p)', () =>
		instance.execute.call(mockThis),
	);
	const [returnData] = result;
	assert.equal(returnData.length, 1, 'merge must produce exactly 1 output item');

	const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
	const outputPdf = await PDFDocument.load(outputBuffer);
	assert.equal(outputPdf.getPageCount(), 2 + 100, 'merged page count must equal sum of inputs (2 + 100)');

	console.log(
		`[harness] Test 2 PASSED: 1 output item, 102 pages (2 + 100). Peak RSS during merge: ${(
			peakRss /
			1024 /
			1024
		).toFixed(1)}MB`,
	);
} catch (error) {
	failures++;
	console.error('[harness] Test 2 FAILED:', error);
}

// ---------------------------------------------------------------------------
// Test 3: Extract > Page Count, per item.
// ---------------------------------------------------------------------------
try {
	console.log('\n[harness] Test 3: Extract > Page Count');
	const items = [itemWithPdf(pdfA), itemWithPdf(pdfB), itemWithPdf(pdf100)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'extract',
		operation: 'pageCount',
		binaryPropertyName: 'data',
	});

	const { result } = await withRssSampling('pageCount(3 items)', () => instance.execute.call(mockThis));
	const [returnData] = result;
	assert.equal(returnData.length, 3, 'pageCount must produce 1 output item per input item');
	assert.equal(returnData[0].json.pageCount, 2, 'Doc A page count must be 2');
	assert.equal(returnData[1].json.pageCount, 3, 'Doc B page count must be 3');
	assert.equal(returnData[2].json.pageCount, 100, 'Doc 100 page count must be 100');

	console.log('[harness] Test 3 PASSED: page counts [2, 3, 100] all correct');
} catch (error) {
	failures++;
	console.error('[harness] Test 3 FAILED:', error);
}

console.log(`\n[harness] ${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
