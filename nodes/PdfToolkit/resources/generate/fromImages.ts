import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { assertBinarySizeWithinLimit, embedImageAuto, PDFDocument } from '../../shared/pdf';

const showOnlyForFromImages = { resource: ['generate'], operation: ['fromImages'] };

/**
 * The drop-in replacement for `n8n-nodes-pdfkit`'s entire feature set
 * (images -> PDF). See the README migration note.
 */
export const fromImagesDescription: INodeProperties[] = [
	binaryPropertyField('generate', 'fromImages', {
		description:
			'Name of the binary field, on each incoming item, that contains an image (JPEG/PNG) to add as a page. Images are added in input order.',
	}),
	{
		displayName: 'Page Size',
		name: 'pageSize',
		type: 'options',
		displayOptions: { show: showOnlyForFromImages },
		options: [
			{ name: 'Fit to Image', value: 'fit' },
			{ name: 'A4', value: 'a4' },
			{ name: 'Letter', value: 'letter' },
		],
		default: 'fit',
		description: 'Page size to use for each image page',
	},
	outputOptionsField('generate', 'fromImages', [], 'images.pdf'),
];

// A4 and US Letter in PDF points (1pt = 1/72in) — pdf-lib's native unit.
const A4_SIZE: [number, number] = [595.28, 841.89];
const LETTER_SIZE: [number, number] = [612, 792];
// Margin used for the A4/Letter "fit inside the page" modes, so the
// image never touches the page edge. "Fit to Image" mode uses no margin (the
// page IS the image, matching n8n-nodes-pdfkit's own image-per-page output).
const FIXED_PAGE_MARGIN = 36;

// Implemented with pdf-lib directly — this op only ever needed pdf-lib's
// image-embedding support, not pdfmake (the layout engine Generate > From
// Template/From Markdown use). One page per incoming image (one binary
// field, read across every incoming item, in input order — the same "all
// incoming items" convention Document > Merge uses), via `embedPng`/
// `embedJpg` (sniffed by signature, shared `embedImageAuto` helper) +
// `page.drawImage()`.
//
// Many-to-one cardinality (see the README migration note: "Images→PDF, the
// n8n-nodes-pdfkit parity op" — pdfkit-node itself combines every incoming
// image into ONE multi-page PDF). This mirrors Document > Merge: called ONCE
// per node execution with every incoming item, not once per item — see
// `ManyToOneExecuteMap` in `shared/types.ts` and the dispatch in
// `PdfToolkit.node.ts`. There's no single `itemIndex` to blame a failure on
// here, so binary-input validation (`this.helpers.assertBinaryData`) for the
// image field on each item happens inside this function, not in the generic
// per-item pre-check `PdfToolkit.node.ts` does for itemwise operations.
export async function fromImagesExecute(
	this: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', 0, 'data') as string;
	const pageSize = this.getNodeParameter('pageSize', 0, 'fit') as 'fit' | 'a4' | 'letter';
	const options = this.getNodeParameter('options', 0, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	if (items.length === 0) {
		throw new NodeOperationError(this.getNode(), 'From Images found no incoming items to render');
	}

	const pdf = await PDFDocument.create();

	for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
		this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
		const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
		assertBinarySizeWithinLimit(buffer, this.getNode(), binaryPropertyName, itemIndex);
		const image = await embedImageAuto(pdf, buffer, this.getNode(), binaryPropertyName, itemIndex);

		if (pageSize === 'fit') {
			// The page IS the image, at its natural pixel dimensions (1px = 1pt) —
			// matches n8n-nodes-pdfkit's own "one image per page" output.
			const page = pdf.addPage([image.width, image.height]);
			page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
		} else {
			const [pageWidth, pageHeight] = pageSize === 'letter' ? LETTER_SIZE : A4_SIZE;
			const page = pdf.addPage([pageWidth, pageHeight]);
			const maxWidth = pageWidth - 2 * FIXED_PAGE_MARGIN;
			const maxHeight = pageHeight - 2 * FIXED_PAGE_MARGIN;
			const { width, height } = image.scaleToFit(maxWidth, maxHeight);
			page.drawImage(image, {
				x: (pageWidth - width) / 2,
				y: (pageHeight - height) / 2,
				width,
				height,
			});
		}
	}

	const outputFileName = options.outputFileName ?? 'images.pdf';
	const bytes = await pdf.save();
	const binaryData = await this.helpers.prepareBinaryData(
		Buffer.from(bytes),
		outputFileName,
		'application/pdf',
	);

	return {
		json: { pageCount: pdf.getPageCount() },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: items.map((_item, itemIndex) => ({ item: itemIndex })),
	};
}
