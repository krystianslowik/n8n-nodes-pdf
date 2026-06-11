import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const mergeDescription: INodeProperties[] = [
	binaryPropertyField('document', 'merge', {
		description:
			'Name of the binary field, on each incoming item, that contains a PDF file to merge. Items are merged in input order.',
	}),
	outputOptionsField('document', 'merge', [], 'merged.pdf'),
];

// TODO: implement with pdf-lib (PdfDocument.copyPages across all incoming
// items' binaries, preserving item order) once the bundling strategy for
// PRD open question O1 is resolved.
export async function mergeExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Merge', itemIndex);
}
