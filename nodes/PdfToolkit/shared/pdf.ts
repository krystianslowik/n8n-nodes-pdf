import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// pdf-lib is a devDependency, never a runtime one: esbuild bundles it into
// dist/ (scripts/esbuild-bundle.mjs), so nothing under this exact `import`
// line ever ships. `no-restricted-imports` is a source-level AST check with
// no bundling-aware escape hatch; the artifact it actually protects is the
// compiled dist file, which IS scanner-checked (via `npm run scan`) and does
// not contain an unbundled `pdf-lib` import. Centralizing the import here
// (instead of repeating it in every
// resources/**/*.ts file) means only this one ImportDeclaration needs the
// suppression (ESLint reports on the `import` keyword's line, which is the
// line right after this comment, regardless of how many named specifiers the
// statement has) — every op file below imports these symbols FROM this
// module (a relative import, always allowed) instead of importing pdf-lib
// directly. The field-class exports (PDFCheckBox etc.) are needed as real
// runtime values (Form > Read Fields / Fill Form use `instanceof` to tell
// field types apart), not just types.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import {
	PDFDocument,
	degrees,
	rgb,
	PDFArray,
	PDFButton,
	PDFCheckBox,
	PDFDict,
	PDFDropdown,
	PDFField,
	PDFName,
	PDFNumber,
	PDFObject,
	PDFOptionList,
	PDFRadioGroup,
	PDFRawStream,
	PDFSignature,
	PDFStream,
	PDFString,
	PDFTextField,
} from 'pdf-lib';
// Type-only import of the same package: a separate ImportDeclaration, so it
// needs its own suppression (see the comment above). `PDFFont`/`PDFPage`
// carry no runtime weight (erased by tsc) but are needed to type the
// Unicode-font helpers in `shared/fonts.ts`.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import type { PDFFont, PDFPage, PDFPageDrawTextOptions } from 'pdf-lib';

export {
	PDFDocument,
	degrees,
	rgb,
	PDFArray,
	PDFButton,
	PDFCheckBox,
	PDFDict,
	PDFDropdown,
	PDFField,
	PDFName,
	PDFNumber,
	PDFObject,
	PDFOptionList,
	PDFRadioGroup,
	PDFRawStream,
	PDFSignature,
	PDFStream,
	PDFString,
	PDFTextField,
};
export type { PDFFont, PDFPage, PDFPageDrawTextOptions };

/**
 * 100MB is the hard ceiling for any single PDF binary this node will attempt
 * to load, to avoid unpredictable failures or a memory blowup on oversized
 * input.
 */
export const MAX_BINARY_SIZE_BYTES = 100 * 1024 * 1024;

function formatMb(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Refuse binaries over 100MB with a clear error naming the binary property
 * and item, instead of letting pdf-lib attempt to load an oversized buffer
 * and fail unpredictably (or succeed and risk a memory blowup downstream).
 */
export function assertBinarySizeWithinLimit(
	buffer: Buffer,
	node: INode,
	binaryPropertyName: string,
	itemIndex?: number,
): void {
	if (buffer.length > MAX_BINARY_SIZE_BYTES) {
		throw new NodeOperationError(
			node,
			`Binary property "${binaryPropertyName}" is ${formatMb(buffer.length)}, which exceeds the ` +
				'100MB limit for PDF operations',
			itemIndex === undefined ? {} : { itemIndex },
		);
	}
}

/**
 * Loads a PDF from a binary buffer, applying the size guard first and
 * wrapping any pdf-lib parse failure in a `NodeOperationError` that names
 * the failing binary property and item instead of letting a raw pdf-lib
 * parse error/stack trace surface to the user.
 *
 * `loadOptions` defaults to pdf-lib's own defaults (in particular
 * `updateMetadata: true`), matching every existing caller's behavior. Pass
 * `{ updateMetadata: false }` for READ-ONLY operations over a document's
 * existing metadata (e.g. Extract > Metadata): pdf-lib's default
 * `updateMetadata: true` unconditionally overwrites the loaded document's
 * in-memory `Producer` (to "pdf-lib (https://github.com/Hopding/pdf-lib)")
 * and `ModificationDate` (to "now") on EVERY `PDFDocument.load()` call,
 * regardless of what those fields actually say in the source file —
 * verified empirically (load a PDF with `Producer` set to something else,
 * `getProducer()` still comes back overwritten). That's a reasonable
 * default for operations that re-`save()` a modified document (stamping
 * fresh Producer/ModDate metadata on genuinely new output is normal PDF-tool
 * behavior), but would make Extract > Metadata report pdf-lib's own stamp
 * instead of the document's real, on-disk values.
 */
export async function loadPdfDocument(
	buffer: Buffer,
	node: INode,
	binaryPropertyName: string,
	itemIndex?: number,
	loadOptions?: { updateMetadata?: boolean },
) {
	assertBinarySizeWithinLimit(buffer, node, binaryPropertyName, itemIndex);
	try {
		return await PDFDocument.load(buffer, loadOptions);
	} catch (error) {
		throw new NodeOperationError(
			node,
			`Could not read binary property "${binaryPropertyName}" as a PDF file: ${
				(error as Error).message
			}`,
			itemIndex === undefined ? {} : { itemIndex },
		);
	}
}

/** Saves a pdf-lib document and wraps the bytes for `prepareBinaryData`. */
export async function savePdfAsBinary(
	executeFunctions: IExecuteFunctions,
	pdf: { save(): Promise<Uint8Array> },
	fileName: string,
	mimeType = 'application/pdf',
) {
	const bytes = await pdf.save();
	return executeFunctions.helpers.prepareBinaryData(Buffer.from(bytes), fileName, mimeType);
}

/**
 * pdf-lib's `embedPng`/`embedJpg` are format-specific (no generic
 * "embedImage" that sniffs the format); the PNG signature is the 8-byte
 * magic number `89 50 4E 47 0D 0A 1A 0A`, everything else is treated as JPEG
 * (matches what n8n's binary-data JPEG/PNG mime types cover). Shared by
 * Stamp > Image Watermark, Generate > From Images, and Generate > From
 * Template/From Markdown's image blocks so this sniffing logic isn't
 * duplicated across every caller.
 */
export function looksLikePng(buffer: Buffer): boolean {
	const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (buffer.length < pngSignature.length) return false;
	return pngSignature.every((byte, index) => buffer[index] === byte);
}

/**
 * Embeds a PNG/JPEG image buffer into `pdf`, sniffing the format via
 * {@link looksLikePng}, and wraps any pdf-lib decode failure in a
 * `NodeOperationError` naming the failing binary property/item instead of
 * surfacing a raw pdf-lib stack trace.
 */
export async function embedImageAuto(
	pdf: PDFDocument,
	buffer: Buffer,
	node: INode,
	binaryPropertyName: string,
	itemIndex?: number,
) {
	try {
		return looksLikePng(buffer) ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
	} catch (error) {
		throw new NodeOperationError(
			node,
			`Could not read binary property "${binaryPropertyName}" as a PNG/JPEG image: ${
				(error as Error).message
			}`,
			itemIndex === undefined ? {} : { itemIndex },
		);
	}
}
