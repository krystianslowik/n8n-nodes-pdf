import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForFillForm = { resource: ['form'], operation: ['fillForm'] };

export const fillFormDescription: INodeProperties[] = [
	binaryPropertyField('form', 'fillForm', {
		description: 'Name of the input binary field that contains the PDF form to fill',
	}),
	{
		displayName: 'Field Values',
		name: 'fieldValues',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: showOnlyForFillForm },
		description: 'JSON object mapping form field names to the values to fill them with (PRD F4)',
		typeOptions: { rows: 6 },
	},
	outputOptionsField(
		'form',
		'fillForm',
		[
			{
				displayName: 'Flatten',
				name: 'flatten',
				type: 'boolean',
				default: false,
				description: 'Whether to flatten the form after filling it, making the values non-editable',
			},
		],
		'filled-form.pdf',
	),
];

// TODO: implement with pdf-lib (PdfDocument.getForm(), set each field from
// "Field Values", optionally form.flatten()) once the bundling strategy for
// PRD open question O1 is resolved.
export async function fillFormExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Fill Form', itemIndex);
}
