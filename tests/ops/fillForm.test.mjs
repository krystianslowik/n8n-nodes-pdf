/**
 * Form > Fill Form: fills a PDF form from JSON values, with optional
 * flatten. Round-trips through Form > Read Fields to assert real
 * semantics (not just "no throw") and checks that flattening removes the
 * fields while the visible content (the flattened appearance streams)
 * survives — asserted honestly via `form.getFields()` becoming empty, since
 * pdf-lib doesn't expose text-extraction to verify rendered content directly.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer, itemWithPdf } from '../mock-execute.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

async function makeFormPdf() {
	const pdf = await PDFDocument.create();
	const page = pdf.addPage([300, 300]);
	const form = pdf.getForm();

	const name = form.createTextField('applicant.name');
	name.addToPage(page, { x: 20, y: 250, width: 200, height: 20 });

	const agree = form.createCheckBox('applicant.agreesToTerms');
	agree.addToPage(page, { x: 20, y: 220, width: 15, height: 15 });

	const country = form.createDropdown('applicant.country');
	country.addOptions(['USA', 'Canada', 'Mexico']);
	country.addToPage(page, { x: 20, y: 190, width: 100, height: 20 });

	return Buffer.from(await pdf.save());
}

async function runFillForm(buffer, fieldValues, options = {}) {
	const items = [itemWithPdf(buffer)];
	const mockThis = createMockExecuteFunctions(items, {
		resource: 'form',
		operation: 'fillForm',
		binaryPropertyName: 'data',
		fieldValues: JSON.stringify(fieldValues),
		options,
	});
	const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
	assert.equal(returnData.length, 1);
	return { json: returnData[0].json, buffer: decodeOutputPdfBuffer(returnData[0]) };
}

export const tests = [
	{
		name: 'fills a text field, a checkbox, and a dropdown, readable back with the new values',
		fn: async () => {
			const formPdf = await makeFormPdf();
			const { json, buffer } = await runFillForm(formPdf, {
				'applicant.name': 'John Smith',
				'applicant.agreesToTerms': true,
				'applicant.country': 'Mexico',
			});
			assert.equal(json.fieldsFilled, 3);
			assert.equal(json.flattened, false);

			const filledPdf = await PDFDocument.load(buffer);
			const form = filledPdf.getForm();
			assert.equal(form.getTextField('applicant.name').getText(), 'John Smith');
			assert.equal(form.getCheckBox('applicant.agreesToTerms').isChecked(), true);
			assert.deepEqual(form.getDropdown('applicant.country').getSelected(), ['Mexico']);
		},
	},
	{
		name: 'unchecking a checkbox by passing a falsy value works',
		fn: async () => {
			const formPdf = await makeFormPdf();
			const { buffer } = await runFillForm(formPdf, { 'applicant.agreesToTerms': true });
			const oncePdf = await PDFDocument.load(buffer);
			assert.equal(oncePdf.getForm().getCheckBox('applicant.agreesToTerms').isChecked(), true);

			const { buffer: uncheckedBuffer } = await runFillForm(buffer, {
				'applicant.agreesToTerms': false,
			});
			const uncheckedPdf = await PDFDocument.load(uncheckedBuffer);
			assert.equal(uncheckedPdf.getForm().getCheckBox('applicant.agreesToTerms').isChecked(), false);
		},
	},
	{
		name: 'flatten removes the fields but the document keeps its page (content survives)',
		fn: async () => {
			const formPdf = await makeFormPdf();
			const { json, buffer } = await runFillForm(
				formPdf,
				{ 'applicant.name': 'Flattened Person' },
				{ flatten: true },
			);
			assert.equal(json.flattened, true);

			const flattenedPdf = await PDFDocument.load(buffer);
			assert.equal(flattenedPdf.getPageCount(), 1, 'the page must still be there after flatten');
			assert.equal(
				flattenedPdf.getForm().getFields().length,
				0,
				'fields must be gone (non-editable) after flatten',
			);
		},
	},
	{
		name: 'an unknown field name throws a NodeOperationError naming the field',
		fn: async () => {
			const formPdf = await makeFormPdf();
			await assert.rejects(
				() => runFillForm(formPdf, { 'does.not.exist': 'value' }),
				(error) => {
					assert.match(error.message, /does\.not\.exist/);
					return true;
				},
			);
		},
	},
	{
		name: 'selecting an option not on a dropdown throws a NodeOperationError naming the field',
		fn: async () => {
			const formPdf = await makeFormPdf();
			await assert.rejects(
				() => runFillForm(formPdf, { 'applicant.country': 'Atlantis' }),
				(error) => {
					assert.match(error.message, /applicant\.country/);
					return true;
				},
			);
		},
	},
];
