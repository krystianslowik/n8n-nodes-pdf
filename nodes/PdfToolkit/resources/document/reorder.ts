import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const reorderDescription: INodeProperties[] = [
	binaryPropertyField('document', 'reorder'),
	{
		displayName: 'New Order',
		name: 'newOrder',
		type: 'string',
		default: '',
		placeholder: '3,1,2,4',
		required: true,
		displayOptions: { show: { resource: ['document'], operation: ['reorder'] } },
		description:
			'Comma-separated list of 1-indexed page numbers in the new order the output document should have (e.g. "3,1,2,4" moves page 3 to the front). Must list every page exactly once.',
	},
	outputOptionsField('document', 'reorder', [], 'reordered.pdf'),
];

// TODO: implement with pdf-lib (parse the new-order string, then
// PdfDocument.copyPages in that order into a new document) once the
// bundling strategy for PRD open question O1 is resolved.
export async function reorderExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Reorder', itemIndex);
}
