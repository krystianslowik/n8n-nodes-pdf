import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField, pageRangeField } from '../../shared/descriptions';
import { parsePageRanges } from '../../shared/pageRanges';
import { PDFDocument, loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';

export const extractPagesDescription: INodeProperties[] = [
	binaryPropertyField('document', 'extractPages'),
	pageRangeField('document', 'extractPages', {
		description: 'Pages to extract into a single output PDF (e.g. "1-3,7,9-").',
	}),
	outputOptionsField('document', 'extractPages', [], 'extracted-pages.pdf'),
];

// Implemented with pdf-lib: parses the page-range expression into a single,
// deduplicated selection (shared/pageRanges.ts's `parsePageRanges` — unlike
// Split, every selected page lands in ONE output PDF, not one per range),
// then copies exactly those pages into a new PDFDocument.
export async function extractPagesExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const pageRanges = this.getNodeParameter('pageRanges', itemIndex, '') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	// Binary presence is already validated by `PdfToolkit.node.ts`'s generic
	// itemwise pre-check (via `documentBinaryInputParamMap`) before this runs.
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const sourcePdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const pages = parsePageRanges(pageRanges, sourcePdf.getPageCount(), this.getNode(), itemIndex);

	const outputPdf = await PDFDocument.create();
	const copiedPages = await outputPdf.copyPages(sourcePdf, pages);
	for (const page of copiedPages) {
		outputPdf.addPage(page);
	}

	const outputFileName = options.outputFileName ?? 'extracted-pages.pdf';
	const binaryData = await savePdfAsBinary(this, outputPdf, outputFileName);

	return {
		json: { pageCount: outputPdf.getPageCount() },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
