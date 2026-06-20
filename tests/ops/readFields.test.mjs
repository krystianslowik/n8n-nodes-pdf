/**
 * Form > Read Fields: reads a PDF form's fields into JSON (name, type,
 * current value, options where applicable — PRD F4). The test PDF form is
 * created with pdf-lib's own form API (`form.createTextField`,
 * `form.createCheckBox`, `form.createRadioGroup`), per the group spec.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, itemWithPdf } from '../mock-execute.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function makeFormPdf() {
	const pdf = await PDFDocument.create();
	const page = pdf.addPage([300, 300]);
	const form = pdf.getForm();

	const name = form.createTextField('applicant.name');
	name.setText('Jane Doe');
	name.addToPage(page, { x: 20, y: 250, width: 200, height: 20 });

	const agree = form.createCheckBox('applicant.agreesToTerms');
	agree.check();
	agree.addToPage(page, { x: 20, y: 220, width: 15, height: 15 });

	const country = form.createDropdown('applicant.country');
	country.addOptions(['USA', 'Canada', 'Mexico']);
	country.select('Canada');
	country.addToPage(page, { x: 20, y: 190, width: 100, height: 20 });

	return Buffer.from(await pdf.save());
}

async function runReadFields(buffer) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'form',
		operation: 'readFields',
		binaryPropertyName: 'data',
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1);
	return returnData[0].json;
}

export const tests = [
	{
		name: 'reads a text field, a checkbox, and a dropdown with their current values',
		fn: async () => {
			const formPdf = await makeFormPdf();
			const { fieldCount, fields } = await runReadFields(formPdf);
			assert.equal(fieldCount, 3);

			const byName = Object.fromEntries(fields.map((field) => [field.name, field]));
			assert.equal(byName['applicant.name'].type, 'text');
			assert.equal(byName['applicant.name'].value, 'Jane Doe');

			assert.equal(byName['applicant.agreesToTerms'].type, 'checkbox');
			assert.equal(byName['applicant.agreesToTerms'].value, true);

			assert.equal(byName['applicant.country'].type, 'dropdown');
			assert.deepEqual(byName['applicant.country'].value, ['Canada']);
			assert.deepEqual(byName['applicant.country'].options, ['USA', 'Canada', 'Mexico']);
		},
	},
	{
		name: 'a PDF with no AcroForm returns zero fields, not an error',
		fn: async () => {
			const plainPdf = await PDFDocument.create();
			plainPdf.addPage([100, 100]);
			const buffer = Buffer.from(await plainPdf.save());

			const { fieldCount, fields } = await runReadFields(buffer);
			assert.equal(fieldCount, 0);
			assert.deepEqual(fields, []);
		},
	},
];
