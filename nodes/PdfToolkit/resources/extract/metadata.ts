import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

export const extractMetadataDescription: INodeProperties[] = [binaryPropertyField('extract', 'metadata')];

// TODO: implement with pdfjs-dist (getDocument().getMetadata(), mapped to
// JSON: title, author, subject, keywords, creator, producer, creation/mod
// dates) once the bundling strategy for PRD open question O1 is resolved.
export async function extractMetadataExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Metadata', itemIndex);
}
