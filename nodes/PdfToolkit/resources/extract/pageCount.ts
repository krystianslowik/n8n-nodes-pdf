import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const extractPageCountDescription: INodeProperties[] = [
	binaryPropertyField('extract', 'pageCount'),
];

// TODO: implement with pdfjs-dist (getDocument().numPages) once the
// bundling strategy for PRD open question O1 is resolved.
export async function extractPageCountExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Page Count', itemIndex);
}
