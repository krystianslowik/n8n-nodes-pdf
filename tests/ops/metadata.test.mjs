/**
 * Extract > Metadata: reads title/author/subject/keywords/creator/producer/
 * creation+modification dates from a PDF's Info dictionary via pdf-lib
 * (read-only — see the module doc comment in
 * `nodes/PdfToolkit/resources/extract/metadata.ts` for why write/set
 * metadata isn't implemented: no such operation is scaffolded in the UI).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, itemWithPdf } from '../mock-execute.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function runMetadata(buffer) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'extract',
		operation: 'metadata',
		binaryPropertyName: 'data',
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1);
	return returnData[0].json;
}

export const tests = [
	{
		name: 'reads every set metadata field, plus page count',
		fn: async () => {
			const pdf = await PDFDocument.create();
			pdf.addPage([100, 100]);
			pdf.addPage([100, 100]);
			pdf.setTitle('Quarterly Report');
			pdf.setAuthor('Jane Doe');
			pdf.setSubject('Q3 numbers');
			pdf.setKeywords(['finance', 'q3', 'report']);
			pdf.setCreator('n8n-nodes-pdf test suite');
			pdf.setProducer('pdf-lib');
			const creationDate = new Date('2024-01-15T10:30:00.000Z');
			const modDate = new Date('2024-02-20T08:00:00.000Z');
			pdf.setCreationDate(creationDate);
			pdf.setModificationDate(modDate);
			const buffer = Buffer.from(await pdf.save());

			const json = await runMetadata(buffer);
			assert.equal(json.title, 'Quarterly Report');
			assert.equal(json.author, 'Jane Doe');
			assert.equal(json.subject, 'Q3 numbers');
			assert.equal(json.keywords, 'finance q3 report');
			assert.equal(json.creator, 'n8n-nodes-pdf test suite');
			assert.equal(json.producer, 'pdf-lib');
			assert.equal(json.creationDate, creationDate.toISOString());
			assert.equal(json.modificationDate, modDate.toISOString());
			assert.equal(json.pageCount, 2);
		},
	},
	{
		name: 'a PDF with no title/author/subject/keywords set returns null for those fields, not an error',
		fn: async () => {
			// pdf-lib's `PDFDocument.create()` always populates Producer/Creator/
			// CreationDate/ModificationDate itself (`updateInfoDict()`, called from
			// its constructor) — only Title/Author/Subject/Keywords are genuinely
			// left unset by default, so those are the ones this case can assert
			// come back `null` rather than an empty/placeholder string.
			const pdf = await PDFDocument.create();
			pdf.addPage([100, 100]);
			const buffer = Buffer.from(await pdf.save());

			const json = await runMetadata(buffer);
			assert.equal(json.title, null);
			assert.equal(json.author, null);
			assert.equal(json.subject, null);
			assert.equal(json.keywords, null);
			assert.equal(typeof json.producer, 'string');
			assert.ok(json.producer.length > 0);
			assert.equal(json.pageCount, 1);
		},
	},
];
