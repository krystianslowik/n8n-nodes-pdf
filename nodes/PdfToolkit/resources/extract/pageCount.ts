import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { loadPdfDocument } from '../../shared/pdf';

export const extractPageCountDescription: INodeProperties[] = [
	binaryPropertyField('extract', 'pageCount'),
];

// Implemented with pdf-lib (PDFDocument.getPageCount()). PRD F8/Tier1
// originally scoped this to pdfjs-dist, but for the spike (and given pdf-lib
// is already bundled for Document/Form/Stamp) reusing pdf-lib here avoids
// bundling a second PDF-parsing library for a single number.
export async function extractPageCountExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	// Binary presence is already validated by `PdfToolkit.node.ts`'s generic
	// itemwise pre-check (via `extractBinaryInputParamMap`) before this runs.
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);

	return {
		json: { pageCount: pdf.getPageCount() },
		pairedItem: itemIndex,
	};
}
