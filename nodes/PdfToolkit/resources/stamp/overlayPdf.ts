import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { loadPdfDocument, savePdfAsBinary } from '../../shared/pdf';

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
	{
		displayName: 'Overlay Mode',
		name: 'overlayMode',
		type: 'options',
		displayOptions: { show: showOnlyForOverlayPdf },
		options: [
			{
				name: 'Repeat First Page',
				value: 'firstPage',
				description: "Overlay the overlay PDF's first page onto every page of the base PDF",
			},
			{
				name: 'Matching Pages',
				value: 'matchingPages',
				description:
					"Overlay the overlay PDF's page N onto the base PDF's page N, for as many pages as both documents have",
			},
		],
		default: 'firstPage',
	},
	outputOptionsField('stamp', 'overlayPdf', [], 'overlaid.pdf'),
];

// Implemented with pdf-lib. `PDFDocument.embedPdf()` is a thin convenience
// wrapper around `embedPages`/`embedPage` (it resolves the source pages, then
// calls `embedPages` internally) — used here instead of calling `embedPage`
// once per page/mode by hand, since it accepts an already-loaded
// `PDFDocument` plus a page-index list directly (exactly what both overlay
// modes need). Each embedded page is then drawn onto its target page(s) with
// `page.drawPage()`, scaled to that target page's size.
export async function overlayPdfExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const overlayBinaryPropertyName = this.getNodeParameter(
		'overlayBinaryPropertyName',
		itemIndex,
		'overlay',
	) as string;
	const overlayMode = this.getNodeParameter('overlayMode', itemIndex, 'firstPage') as
		| 'firstPage'
		| 'matchingPages';
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	this.helpers.assertBinaryData(itemIndex, overlayBinaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const targetPdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);

	const overlayBuffer = await this.helpers.getBinaryDataBuffer(itemIndex, overlayBinaryPropertyName);
	const overlayPdf = await loadPdfDocument(
		overlayBuffer,
		this.getNode(),
		overlayBinaryPropertyName,
		itemIndex,
	);

	const targetPages = targetPdf.getPages();
	let overlaidPageCount = 0;

	if (overlayMode === 'matchingPages') {
		const pagesToOverlay = Math.min(targetPages.length, overlayPdf.getPageCount());
		const indices = Array.from({ length: pagesToOverlay }, (_, index) => index);
		const embeddedPages = await targetPdf.embedPdf(overlayPdf, indices);
		for (let index = 0; index < pagesToOverlay; index++) {
			const page = targetPages[index];
			const { width, height } = page.getSize();
			page.drawPage(embeddedPages[index], { x: 0, y: 0, width, height });
			overlaidPageCount++;
		}
	} else {
		const [embeddedFirstPage] = await targetPdf.embedPdf(overlayPdf, [0]);
		for (const page of targetPages) {
			const { width, height } = page.getSize();
			page.drawPage(embeddedFirstPage, { x: 0, y: 0, width, height });
			overlaidPageCount++;
		}
	}

	const outputFileName = options.outputFileName ?? 'overlaid.pdf';
	const binaryData = await savePdfAsBinary(this, targetPdf, outputFileName);

	return {
		json: { pageCount: targetPages.length, overlaidPageCount },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
