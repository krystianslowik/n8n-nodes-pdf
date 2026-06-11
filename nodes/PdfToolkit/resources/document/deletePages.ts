import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const deletePagesDescription: INodeProperties[] = [
	binaryPropertyField('document', 'deletePages'),
	pageRangeField('document', 'deletePages', {
		description: 'Pages to delete from the document (e.g. "1-3,7,9-").',
	}),
	outputOptionsField('document', 'deletePages', [], 'document.pdf'),
];

// TODO: implement with pdf-lib (parse the page-range string, then
// PdfDocument.removePage for each selected page index, highest index first)
// once the bundling strategy for PRD open question O1 is resolved.
export async function deletePagesExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Delete Pages', itemIndex);
}
