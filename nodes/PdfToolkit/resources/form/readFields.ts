import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import {
	PDFButton,
	PDFCheckBox,
	PDFDropdown,
	PDFField,
	PDFOptionList,
	PDFRadioGroup,
	PDFSignature,
	PDFTextField,
	loadPdfDocument,
} from '../../shared/pdf';

export const readFieldsDescription: INodeProperties[] = [
	binaryPropertyField('form', 'readFields', {
		description: 'Name of the input binary field that contains the PDF form to read',
	}),
];

/**
 * One entry per form field: name, type, current value, and options where
 * applicable.
 */
interface FormFieldJson {
	name: string;
	type: string;
	value: string | string[] | boolean | null;
	options?: string[];
	required: boolean;
	readOnly: boolean;
}

// pdf-lib represents every field kind as a subclass of the abstract
// `PDFField`; there's no `.type` string on the base class, so telling them
// apart means `instanceof`-checking against the concrete subclasses (hence
// importing the classes themselves, not just their types, from shared/pdf.ts).
function describeField(field: PDFField): FormFieldJson {
	const base = {
		name: field.getName(),
		required: field.isRequired(),
		readOnly: field.isReadOnly(),
	};

	if (field instanceof PDFCheckBox) {
		return { ...base, type: 'checkbox', value: field.isChecked() };
	}
	if (field instanceof PDFRadioGroup) {
		return { ...base, type: 'radioGroup', value: field.getSelected() ?? null, options: field.getOptions() };
	}
	if (field instanceof PDFDropdown) {
		return { ...base, type: 'dropdown', value: field.getSelected(), options: field.getOptions() };
	}
	if (field instanceof PDFOptionList) {
		return { ...base, type: 'optionList', value: field.getSelected(), options: field.getOptions() };
	}
	if (field instanceof PDFTextField) {
		return { ...base, type: 'text', value: field.getText() ?? '' };
	}
	if (field instanceof PDFButton) {
		return { ...base, type: 'button', value: null };
	}
	if (field instanceof PDFSignature) {
		return { ...base, type: 'signature', value: null };
	}
	return { ...base, type: 'unknown', value: null };
}

// Implemented with pdf-lib: `PDFDocument.getForm().getFields()`, mapped to
// name/type/value/options JSON. `getForm()` returns an empty
// `PDFForm` (zero fields, not an error) for a PDF with no AcroForm at all —
// that's a legitimate "this PDF has no form fields" result, not a failure.
export async function readFieldsExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const form = pdf.getForm();
	const fields = form.getFields().map(describeField);

	return {
		json: { fieldCount: fields.length, fields },
		pairedItem: itemIndex,
	};
}
