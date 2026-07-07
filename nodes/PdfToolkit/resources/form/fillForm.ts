import type { IExecuteFunctions, INode, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { binaryPropertyField, outputOptionsField } from '../../shared/descriptions';
import { embedUnicodeFonts, findUncoveredCodePointLabel } from '../../shared/fonts';
import type { UnicodeFontBundle } from '../../shared/fonts';
import {
	PDFCheckBox,
	PDFDropdown,
	PDFField,
	PDFOptionList,
	PDFRadioGroup,
	PDFTextField,
	loadPdfDocument,
	savePdfAsBinary,
} from '../../shared/pdf';

const showOnlyForFillForm = { resource: ['form'], operation: ['fillForm'] };

export const fillFormDescription: INodeProperties[] = [
	binaryPropertyField('form', 'fillForm', {
		description: 'Name of the input binary field that contains the PDF form to fill',
	}),
	{
		displayName: 'Field Values',
		name: 'fieldValues',
		type: 'json',
		default: '{}',
		required: true,
		displayOptions: { show: showOnlyForFillForm },
		description: 'JSON object mapping form field names to the values to fill them with',
		typeOptions: { rows: 6 },
	},
	outputOptionsField(
		'form',
		'fillForm',
		[
			{
				displayName: 'Flatten',
				name: 'flatten',
				type: 'boolean',
				default: false,
				description: 'Whether to flatten the form after filling it, making the values non-editable',
			},
		],
		'filled-form.pdf',
	),
];

/**
 * Sets one field's value from the corresponding "Field Values" JSON entry,
 * dispatching on the field's concrete pdf-lib subclass (same `instanceof`
 * approach as `readFields.ts`). Any pdf-lib error while setting the value
 * (e.g. selecting an option that doesn't exist on a dropdown/radio group) is
 * re-wrapped naming the field, so errors name the failing field instead of
 * surfacing a raw pdf-lib error/stack trace.
 */
function setFieldValue(
	field: PDFField,
	fieldName: string,
	rawValue: unknown,
	node: INode,
	itemIndex: number,
): void {
	try {
		if (field instanceof PDFCheckBox) {
			if (rawValue) {
				field.check();
			} else {
				field.uncheck();
			}
			return;
		}
		if (field instanceof PDFRadioGroup) {
			field.select(String(rawValue));
			return;
		}
		if (field instanceof PDFDropdown) {
			// Unlike `PDFRadioGroup`/`PDFOptionList`, pdf-lib's `PDFDropdown.select()`
			// silently accepts a value outside `getOptions()` (dropdowns MAY be
			// editable combo boxes) — validate explicitly so a typo'd value fails
			// loudly instead of turning the field into free text unexpectedly.
			const value = String(rawValue);
			const validOptions = field.getOptions();
			if (!validOptions.includes(value)) {
				throw new Error(
					`"${value}" is not one of this dropdown's options (${validOptions.join(', ')})`,
				);
			}
			field.select(value);
			return;
		}
		if (field instanceof PDFOptionList) {
			field.select(Array.isArray(rawValue) ? rawValue.map(String) : String(rawValue));
			return;
		}
		if (field instanceof PDFTextField) {
			field.setText(rawValue === null || rawValue === undefined ? undefined : String(rawValue));
			return;
		}
	} catch (error) {
		throw new NodeOperationError(
			node,
			`Fill Form: could not set field "${fieldName}" to "${String(rawValue)}": ${
				(error as Error).message
			}`,
			{ itemIndex },
		);
	}
	throw new NodeOperationError(
		node,
		`Fill Form: field "${fieldName}" is of a type that cannot be filled with a value`,
		{ itemIndex },
	);
}

/**
 * pdf-lib draws a text/dropdown/option-list field's WHOLE appearance with a
 * single font (unlike `drawUnicodeText`'s per-run emoji fallback used by
 * Generate/Stamp), so a value containing a character the bundled Noto Sans
 * face has no glyph for — most commonly emoji — can't be silently
 * mixed-font-drawn into a field's appearance stream. Checked right after the
 * value is set, so the error names the specific field, not a generic font
 * error surfacing later from `form.updateFieldAppearances()`.
 */
function assertFieldAppearanceCoverage(
	field: PDFField,
	fieldName: string,
	bundle: UnicodeFontBundle,
	node: INode,
	itemIndex: number,
): void {
	let text: string | undefined;
	if (field instanceof PDFTextField) text = field.getText();
	else if (field instanceof PDFDropdown) text = field.getSelected().join(', ');
	else if (field instanceof PDFOptionList) text = field.getSelected().join(', ');
	if (!text) return;

	const uncovered = findUncoveredCodePointLabel(bundle, text, 'regular');
	if (uncovered) {
		throw new NodeOperationError(
			node,
			`Fill Form: field "${fieldName}"'s value contains a character (${uncovered}) that this ` +
				"operation cannot render into a form field's appearance — Fill Form supports Latin/Latin " +
				'Extended/Cyrillic/Greek text in field values, not emoji or other pictographic characters',
			{ itemIndex },
		);
	}
}

// Implemented with pdf-lib: `PDFDocument.getForm()`, set each field named in
// "Field Values" from its JSON value, optionally `form.flatten()`.
export async function fillFormExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
	const fieldValuesParam = this.getNodeParameter('fieldValues', itemIndex, '{}');
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
		flatten?: boolean;
	};

	let fieldValues: Record<string, unknown>;
	try {
		fieldValues =
			typeof fieldValuesParam === 'string'
				? (JSON.parse(fieldValuesParam) as Record<string, unknown>)
				: (fieldValuesParam as Record<string, unknown>);
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Fill Form: "Field Values" is not valid JSON: ${(error as Error).message}`,
			{ itemIndex },
		);
	}

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const pdf = await loadPdfDocument(buffer, this.getNode(), binaryPropertyName, itemIndex);
	const form = pdf.getForm();
	const bundle = await embedUnicodeFonts(pdf);

	const fieldNames = Object.keys(fieldValues);
	for (const fieldName of fieldNames) {
		let field;
		try {
			field = form.getField(fieldName);
		} catch {
			throw new NodeOperationError(
				this.getNode(),
				`Fill Form: no field named "${fieldName}" exists in this PDF form`,
				{ itemIndex },
			);
		}
		setFieldValue(field, fieldName, fieldValues[fieldName], this.getNode(), itemIndex);
		assertFieldAppearanceCoverage(field, fieldName, bundle, this.getNode(), itemIndex);
	}

	// Regenerate appearances with the embedded Unicode font BEFORE save() gets
	// a chance to do it itself: `PDFDocument.save()` auto-calls
	// `form.updateFieldAppearances()` with pdf-lib's WinAnsi-only DEFAULT font
	// for any field still marked dirty, which is exactly the "WinAnsi cannot
	// encode ł" bug this package is fixing — calling it here first, with our
	// font, marks every field clean so that fallback never fires.
	form.updateFieldAppearances(bundle.fonts.regular);

	const flatten = options.flatten ?? false;
	if (flatten) {
		form.flatten();
	}

	const outputFileName = options.outputFileName ?? 'filled-form.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { fieldsFilled: fieldNames.length, flattened: flatten },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
