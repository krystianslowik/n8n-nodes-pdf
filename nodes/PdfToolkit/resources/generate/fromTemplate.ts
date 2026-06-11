import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForFromTemplate = { resource: ['generate'], operation: ['fromTemplate'] };

export const fromTemplateDescription: INodeProperties[] = [
	{
		displayName: 'Template',
		name: 'template',
		type: 'json',
		default: '{\n  "content": []\n}',
		required: true,
		displayOptions: { show: showOnlyForFromTemplate },
		description:
			'Declarative JSON schema describing the document: text, table, image, and list blocks, plus headers/footers and page numbers (PRD F3). See the node documentation for the full schema.',
		typeOptions: { rows: 10 },
	},
	outputOptionsField(
		'generate',
		'fromTemplate',
		[
			{
				displayName: 'Custom Font Binary Property',
				name: 'customFontBinaryPropertyName',
				type: 'string',
				default: '',
				description:
					'Name of an input binary field containing a custom (e.g. Unicode/CJK) font file to embed, if the bundled base fonts are not sufficient',
			},
		],
		'generated.pdf',
	),
];

// TODO: implement with pdfmake (compile the declarative JSON template into a
// pdfmake document definition and render it) once the bundling strategy for
// PRD open question O1 is resolved.
export async function fromTemplateExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'From Template', itemIndex);
}
