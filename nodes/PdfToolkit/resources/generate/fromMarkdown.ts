import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForFromMarkdown = { resource: ['generate'], operation: ['fromMarkdown'] };

export const fromMarkdownDescription: INodeProperties[] = [
	{
		displayName: 'Markdown',
		name: 'markdown',
		type: 'string',
		typeOptions: { rows: 10 },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForFromMarkdown },
		description:
			'Markdown source to render as a PDF. Supports headings, lists, tables, and code blocks (PRD F9).',
	},
	outputOptionsField('generate', 'fromMarkdown', [], 'document.pdf'),
];

// TODO: implement with pdfmake (parse Markdown into a pdfmake document
// definition — headings, lists, tables, code blocks — and render it) once
// the bundling strategy for PRD open question O1 is resolved.
export async function fromMarkdownExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'From Markdown', itemIndex);
}
