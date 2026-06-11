import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const splitDescription: INodeProperties[] = [
	binaryPropertyField('document', 'split'),
	pageRangeField('document', 'split', {
		description:
			'How to split the document. Each comma-separated range becomes its own output item (e.g. "1-3,7,9-" produces three output PDFs: pages 1-3, page 7, and page 9 to the end).',
	}),
	outputOptionsField('document', 'split', [], 'split.pdf'),
];

// TODO: implement with pdf-lib (parse the page-range string, then
// PdfDocument.copyPages once per range, emitting one output item per range)
// once the bundling strategy for PRD open question O1 is resolved.
export async function splitExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Split', itemIndex);
}
