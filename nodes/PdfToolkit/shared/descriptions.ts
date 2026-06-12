import type { INodeProperties } from 'n8n-workflow';

/**
 * Shared property builders used across the Document/Generate/Form/Stamp/
 * Extract/Secure resource description files. Keeping these here avoids
 * repeating the same "Binary Property" / "Options" boilerplate ~20 times
 * across `resources/**`.
 */

export interface BinaryPropertyFieldOptions {
	name?: string;
	displayName?: string;
	description?: string;
}

/**
 * The "Binary Property" field that every operation consuming a PDF exposes
 * (PRD common-params requirement). Defaults to n8n's usual `data`/`binaryPropertyName`
 * convention (matches core nodes such as "Extract From File").
 */
export function binaryPropertyField(
	resource: string,
	operation: string,
	options: BinaryPropertyFieldOptions = {},
): INodeProperties {
	return {
		displayName: options.displayName ?? 'Binary Property',
		name: options.name ?? 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: { show: { resource: [resource], operation: [operation] } },
		description:
			options.description ?? 'Name of the input binary field that contains the PDF file to use',
	};
}

/**
 * Page-range parameter shared by Split / Extract Pages / Rotate / Delete
 * Pages (PRD F2): an expression-friendly string like `1-3,7,9-`.
 */
export function pageRangeField(
	resource: string,
	operation: string,
	options: { name?: string; displayName?: string; description?: string } = {},
): INodeProperties {
	return {
		displayName: options.displayName ?? 'Page Ranges',
		name: options.name ?? 'pageRanges',
		type: 'string',
		default: '',
		placeholder: '1-3,7,9-',
		required: true,
		displayOptions: { show: { resource: [resource], operation: [operation] } },
		description:
			options.description ??
			'Pages to use, as a comma-separated list of page numbers and/or ranges (e.g. "1-3,7,9-" for pages 1 through 3, page 7, and page 9 to the end). 1-indexed.',
	};
}

/**
 * The "Options" collection every binary-producing operation gets, with
 * "Output Binary Property" and "Output File Name" (PRD common-params
 * requirement).
 */
export function outputOptionsField(
	resource: string,
	operation: string,
	extraOptions: INodeProperties[] = [],
	fileNameDefault = 'document.pdf',
): INodeProperties {
	return {
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: [resource], operation: [operation] } },
		options: [
			{
				displayName: 'Output Binary Property',
				name: 'outputBinaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary field to put the output PDF file in',
			},
			{
				displayName: 'Output File Name',
				name: 'outputFileName',
				type: 'string',
				default: fileNameDefault,
				description: 'File name for the generated PDF file (including extension)',
			},
			...extraOptions,
		],
	};
}
