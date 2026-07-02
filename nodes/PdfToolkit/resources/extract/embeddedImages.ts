import type { IBinaryKeyData, IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { binaryPropertyField } from '../../shared/descriptions';
import {
	loadPdfDocument,
	PDFArray,
	PDFDict,
	PDFName,
	PDFNumber,
	PDFObject,
	PDFRawStream,
	PDFStream,
} from '../../shared/pdf';

const showOnlyForEmbeddedImages = { resource: ['extract'], operation: ['embeddedImages'] };

// Intentional exception to the common-params spec's "Output Binary Property"
// + "Output File Name" pair: Embedded Images emits a *variable* number of
// images (zero or more per PDF), not a single output file, so there's no one
// binary field/file name to configure. A "Output Binary Property Prefix"
// option is used instead — each extracted image lands on its own binary
// field (`<prefix>0`, `<prefix>1`, ...) on the same output item, which is the
// standard n8n convention for operations that produce N binaries per item
// (e.g. core "Extract from File" >  Move to a specific binary property /
// "Read/Write Files from Disk" with multiple files).
export const extractEmbeddedImagesDescription: INodeProperties[] = [
	binaryPropertyField('extract', 'embeddedImages'),
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showOnlyForEmbeddedImages },
		options: [
			{
				displayName: 'Output Binary Property Prefix',
				name: 'outputBinaryPropertyPrefix',
				type: 'string',
				default: 'image',
				description:
					'Prefix used for the binary field of each extracted image on the output item (e.g. "image" produces "image0", "image1", ...)',
			},
		],
	},
];

// DOCUMENTED BOUNDARY (also in the README): this operation can only export an
// image XObject's raw stream bytes AS-IS, without decoding/re-encoding any
// pixel data — so it only supports filters where "the raw stream bytes" ARE
// already a complete, valid standalone image file. DCTDecode (JPEG) is the
// only PDF image filter with that property: verified by embedding a real
// JPEG via pdf-lib, round-tripping it through save()/load(), and comparing
// the extracted raw stream bytes to the original file byte-for-byte (see
// `tests/ops/embeddedImages.test.mjs`). Every other filter PDFs use for
// images — FlateDecode (what pdf-lib's own `embedPng` produces: raw
// decompressed pixel samples, not a PNG file), CCITTFaxDecode (scanned
// fax/TIFF-style bilevel images), JPXDecode (JPEG2000) — would require
// decoding raw samples and re-encoding a brand-new image container
// ourselves: real image-codec work, out of scope for "try pdf-lib raw object
// access first" (per this group's task scope). Rather than silently emit
// corrupt output for those, this throws a clear error naming the filter.
const SUPPORTED_FILTER = 'DCTDecode';
const EXTENSION_FOR_SUPPORTED_FILTER = 'jpg';
const MIME_TYPE_FOR_SUPPORTED_FILTER = 'image/jpeg';

/** A `PDFName`'s `asString()` includes its leading "/" (e.g. "/DCTDecode") — stripped here so filter names compare/print without it. */
function nameWithoutSlash(name: PDFName): string {
	return name.asString().replace(/^\//, '');
}

/** A PDF Image XObject's `/Filter` is either one `PDFName` or a `PDFArray` of them (a filter chain, applied in order) — the LAST one determines the final byte encoding of `getContents()`. */
function lastFilterName(filter: PDFObject | undefined): string | undefined {
	if (!filter) return undefined;
	if (filter instanceof PDFArray) {
		const entries = filter.asArray();
		const last = entries[entries.length - 1];
		return last instanceof PDFName ? nameWithoutSlash(last) : undefined;
	}
	return filter instanceof PDFName ? nameWithoutSlash(filter) : undefined;
}

interface ExtractedImageInfo {
	property: string;
	page: number;
	name: string;
	width: number;
	height: number;
}

// Implemented with pdf-lib's raw object model — no pdfjs-dist needed (see
// spike/FINDINGS.md "Q4 — pdfjs-dist bundling" for why Extract > Text could
// not be bundled within the scanner/no-filesystem/no-dynamic-import
// constraints; this op never needed pdfjs-dist in the first place, since
// pdf-lib already exposes the raw XObject dictionary tree this needs). Walks
// every page's `/Resources /XObject` dictionary, collects each
// `/Subtype /Image` stream exactly once (by indirect reference, so an image
// reused across multiple pages — a common PDF space-saving pattern, e.g. a
// repeated logo — is only extracted once), and emits one binary field per
// image, named `<prefix><index>` (see the module doc comment above for why).
export async function extractEmbeddedImagesExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyPrefix?: string;
	};
	const prefix = options.outputBinaryPropertyPrefix ?? 'image';

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);

	const binary: IBinaryKeyData = {};
	const images: ExtractedImageInfo[] = [];
	const seenRefKeys = new Set<string>();
	let imageIndex = 0;

	const pages = pdf.getPages();
	for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
		const resources = pages[pageIndex].node.Resources();
		const xObjectDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
		if (!xObjectDict) continue;

		for (const [xObjectName, xObjectRef] of xObjectDict.entries()) {
			// Dedupe by the entry's own textual form (an indirect reference like
			// "7 0 R" for a shared/reused image, or the dict entry itself if the
			// PDF inlined it directly) — same image embedded once, referenced from
			// multiple pages, is only extracted once.
			const refKey = xObjectRef.toString();
			if (seenRefKeys.has(refKey)) continue;

			const stream = pdf.context.lookupMaybe(xObjectRef, PDFStream);
			if (!(stream instanceof PDFRawStream)) continue; // Not a raw image stream — not a valid Image XObject this operation can read.
			const object = stream;

			const subtype = object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName);
			if (!subtype || nameWithoutSlash(subtype) !== 'Image') continue;
			seenRefKeys.add(refKey);

			const imageName = nameWithoutSlash(xObjectName);
			const filterName = lastFilterName(object.dict.lookup(PDFName.of('Filter')));
			if (filterName !== SUPPORTED_FILTER) {
				throw new NodeOperationError(
					this.getNode(),
					`Cannot extract embedded image "${imageName}" on page ${pageIndex + 1}: its filter "${
						filterName ?? '(none)'
					}" is not supported. Only ${SUPPORTED_FILTER} ` +
						'(JPEG) images can be extracted as standalone files — other filters would require ' +
						'decoding and re-encoding pixel data, which this operation does not do (see the ' +
						"node's Embedded Images description for the documented boundary).",
					{ itemIndex },
				);
			}

			const width = object.dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0;
			const height = object.dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0;

			const property = `${prefix}${imageIndex}`;
			binary[property] = await this.helpers.prepareBinaryData(
				Buffer.from(object.getContents()),
				`${property}.${EXTENSION_FOR_SUPPORTED_FILTER}`,
				MIME_TYPE_FOR_SUPPORTED_FILTER,
			);
			images.push({ property, page: pageIndex + 1, name: imageName, width, height });
			imageIndex++;
		}
	}

	return {
		json: { imageCount: images.length, images },
		binary,
		pairedItem: itemIndex,
	};
}
