import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import { loadPdfDocument } from '../../shared/pdf';

export const extractMetadataDescription: INodeProperties[] = [
	binaryPropertyField('extract', 'metadata'),
];

function toIsoOrNull(date: Date | undefined): string | null {
	return date ? date.toISOString() : null;
}

// Implemented with pdf-lib (PRD F8 read half; see the module doc comment in
// `resources/extract/index.ts`-adjacent code for why write/set metadata isn't
// scoped here: no write/set-metadata operation is scaffolded anywhere in the
// UI, so there is nothing to wire a setter into). pdf-lib's
// `PDFDocument.load()` already parses the document's Info dictionary, so
// there's no need for a second parser (pdfjs-dist) just for these eight
// fields — reusing pdf-lib (already bundled for every other resource) avoids
// bundling a second PDF-parsing library for metadata alone, the same
// reasoning `pageCount.ts` documents for Page Count.
export async function extractMetadataExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	// `updateMetadata: false`: this is a READ-ONLY operation over the
	// document's real, on-disk metadata — see the `loadPdfDocument()` doc
	// comment for why pdf-lib's default (`true`) would report pdf-lib's OWN
	// Producer/ModificationDate stamp instead.
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex, {
		updateMetadata: false,
	});

	return {
		json: {
			title: pdf.getTitle() ?? null,
			author: pdf.getAuthor() ?? null,
			subject: pdf.getSubject() ?? null,
			keywords: pdf.getKeywords() ?? null,
			creator: pdf.getCreator() ?? null,
			producer: pdf.getProducer() ?? null,
			creationDate: toIsoOrNull(pdf.getCreationDate()),
			modificationDate: toIsoOrNull(pdf.getModificationDate()),
			pageCount: pdf.getPageCount(),
		},
		pairedItem: itemIndex,
	};
}
