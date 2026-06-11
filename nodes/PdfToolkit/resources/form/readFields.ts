import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const readFieldsDescription: INodeProperties[] = [
	binaryPropertyField('form', 'readFields', {
		description: 'Name of the input binary field that contains the PDF form to read',
	}),
];

// TODO: implement with pdf-lib (PdfDocument.getForm().getFields(), mapped to
// name/type/value JSON) once the bundling strategy for PRD open question O1
// is resolved.
export async function readFieldsExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Read Fields', itemIndex);
}
