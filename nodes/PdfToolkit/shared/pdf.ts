import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// pdf-lib is a devDependency, never a runtime one: esbuild bundles it into
// dist/ (scripts/esbuild-bundle.mjs), so nothing under this exact `import`
// line ever ships. `no-restricted-imports` is a source-level AST check with
// no bundling-aware escape hatch (see spike/FINDINGS.md Q2); the artifact it
// actually protects is the compiled dist file, which IS scanner-checked (via
// spike/drive-analyze.mjs) and does not contain an unbundled `pdf-lib`
// import. Centralizing the import here (instead of repeating it in every
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
	PDFButton,
	PDFCheckBox,
	PDFDropdown,
	PDFField,
	PDFOptionList,
	PDFRadioGroup,
	PDFSignature,
	PDFTextField,
} from 'pdf-lib';

export {
	PDFDocument,
	degrees,
	PDFButton,
	PDFCheckBox,
	PDFDropdown,
	PDFField,
	PDFOptionList,
	PDFRadioGroup,
	PDFSignature,
	PDFTextField,
};

/**
 * PRD R2 ("handle 100-page/50MB docs... hard input-size guards + clear
 * errors"). 100MB is the hard ceiling for any single PDF binary this node
 * will attempt to load.
 */
export const MAX_BINARY_SIZE_BYTES = 100 * 1024 * 1024;

function formatMb(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * PRD R2 input-size guard: refuse binaries over 100MB with a clear error
 * naming the binary property and item, instead of letting pdf-lib attempt to
 * load an oversized buffer and fail unpredictably (or succeed and risk a
 * memory blowup downstream).
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
 * Loads a PDF from a binary buffer, applying the PRD R2 size guard first and
 * wrapping any pdf-lib parse failure in a `NodeOperationError` that names
 * the failing binary property and item (PRD UX principle: "Errors name the
 * failing page/field, not library stack traces") instead of letting a raw
 * pdf-lib parse error/stack trace surface to the user.
 */
export async function loadPdfDocument(
	buffer: Buffer,
	node: INode,
	binaryPropertyName: string,
	itemIndex?: number,
) {
	assertBinarySizeWithinLimit(buffer, node, binaryPropertyName, itemIndex);
	try {
		return await PDFDocument.load(buffer);
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
