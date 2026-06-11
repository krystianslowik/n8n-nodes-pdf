import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const extractPagesDescription: INodeProperties[] = [
	binaryPropertyField('document', 'extractPages'),
	pageRangeField('document', 'extractPages', {
		description: 'Pages to extract into a single output PDF (e.g. "1-3,7,9-").',
	}),
	outputOptionsField('document', 'extractPages', [], 'extracted-pages.pdf'),
];

// TODO: implement with pdf-lib (parse the page-range string, then
// PdfDocument.copyPages for the selected pages into one new document) once
// the bundling strategy for PRD open question O1 is resolved.
export async function extractPagesExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Extract Pages', itemIndex);
}
