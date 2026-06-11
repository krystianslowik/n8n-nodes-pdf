import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { throwNotImplemented } from '../../shared/notImplemented';

const showOnlyForOverlayPdf = { resource: ['stamp'], operation: ['overlayPdf'] };

export const overlayPdfDescription: INodeProperties[] = [
	binaryPropertyField('stamp', 'overlayPdf', {
		description: 'Name of the input binary field that contains the base PDF file',
	}),
	{
		displayName: 'Overlay Binary Property',
		name: 'overlayBinaryPropertyName',
		type: 'string',
		default: 'overlay',
		required: true,
		displayOptions: { show: showOnlyForOverlayPdf },
		description: 'Name of the input binary field that contains the PDF file to overlay',
	},
	outputOptionsField('stamp', 'overlayPdf', [], 'overlaid.pdf'),
];

// TODO: implement with pdf-lib (embedPage the overlay PDF's pages and
// page.drawPage them on top of each base-PDF page) once the bundling
// strategy for PRD open question O1 is resolved.
export async function overlayPdfExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	return throwNotImplemented.call(this, 'Overlay PDF', itemIndex);
}
