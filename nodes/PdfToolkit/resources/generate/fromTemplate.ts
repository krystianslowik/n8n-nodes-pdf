import type { IExecuteFunctions, INode, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { outputOptionsField } from '../../shared/descriptions';
import type { Alignment, DocBlock, DocRenderOptions, InlineText } from '../../shared/docRenderer';
import { renderDocument } from '../../shared/docRenderer';
import { assertBinarySizeWithinLimit, PDFDocument, savePdfAsBinary } from '../../shared/pdf';

const showOnlyForFromTemplate = { resource: ['generate'], operation: ['fromTemplate'] };

export const fromTemplateDescription: INodeProperties[] = [
	{
		displayName: 'Template',
		name: 'template',
		type: 'json',
		default:
			'{\n  "content": [\n    { "type": "heading", "level": 1, "text": "Title" },\n    { "type": "paragraph", "text": "Some text." }\n  ]\n}',
		required: true,
		displayOptions: { show: showOnlyForFromTemplate },
		description:
			'Declarative JSON schema describing the document: `content` is an array of blocks — ' +
			'{"type":"heading","level":1-3,"text":...}, {"type":"paragraph","text":...,"alignment":"left|center|right"}, ' +
			'{"type":"list","items":[...],"ordered":false}, {"type":"table","headers":[...],"rows":[[...]]}, ' +
			'{"type":"code","text":"..."}, {"type":"image","binaryPropertyName":"...","width":w,"height":h}, ' +
			'{"type":"pageBreak"}. `text` fields accept a plain string, or an array of ' +
			'{"text":"...","bold":true,"italic":true} runs for mixed inline styling. Top-level `pageSize` ' +
			'("a4"/"letter"), `margins` ({top,bottom,left,right}), `header`/`footer` (same text shape, with ' +
			'"{{page}}"/"{{pages}}" placeholders), and `pageNumbers` (boolean shortcut for a "Page {{page}} ' +
			'of {{pages}}" footer) are also supported. Rendered with a pdf-lib-based layout engine — see ' +
			'nodes/PdfToolkit/shared/docRenderer.ts for this renderer\'s exact v0 boundaries (bundled Unicode ' +
			'fonts only, no nested lists, equal-width table columns).',
		typeOptions: { rows: 10 },
	},
	outputOptionsField(
		'generate',
		'fromTemplate',
		[
			{
				displayName: 'Custom Font Binary Property',
				name: 'customFontBinaryPropertyName',
				type: 'string',
				default: '',
				description:
					'Name of an input binary field containing a custom (e.g. CJK) font file to embed. NOT YET ' +
					'SUPPORTED — setting this throws a clear error rather than silently ignoring it. The bundled ' +
					'Noto Sans/Noto Sans Mono/Noto Emoji faces (Latin/Latin Extended/Cyrillic/Greek plus ' +
					'monochrome emoji) are used instead — see the README\'s Generate section.',
			},
		],
		'generated.pdf',
	),
];

function fail(node: INode, itemIndex: number, message: string): never {
	throw new NodeOperationError(node, `From Template: ${message}`, { itemIndex });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates (and narrows) a template's `text`/`items[]` field: a string, or an array of `{text, bold?, italic?}` run objects. */
function validateInlineText(value: unknown, node: INode, itemIndex: number, path: string): InlineText {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		return value.map((run, index) => {
			if (!isPlainObject(run) || typeof run.text !== 'string') {
				fail(node, itemIndex, `${path}[${index}] must be a string or an object with a "text" string field`);
			}
			return {
				text: run.text as string,
				bold: run.bold === true,
				italic: run.italic === true,
				code: run.code === true,
			};
		});
	}
	fail(node, itemIndex, `${path} must be a string, or an array of {"text": "...", "bold"?, "italic"?} objects`);
}

const KNOWN_BLOCK_TYPES = ['heading', 'paragraph', 'list', 'table', 'code', 'image', 'pageBreak'];

function validateBlock(raw: unknown, node: INode, itemIndex: number, index: number): DocBlock {
	if (!isPlainObject(raw) || typeof raw.type !== 'string') {
		fail(node, itemIndex, `content[${index}] must be an object with a "type" field`);
	}
	if (!KNOWN_BLOCK_TYPES.includes(raw.type)) {
		fail(
			node,
			itemIndex,
			`content[${index}] has unknown block type "${raw.type}" (expected one of: ${KNOWN_BLOCK_TYPES.join(', ')})`,
		);
	}

	switch (raw.type) {
		case 'heading':
		case 'paragraph': {
			const text = validateInlineText(raw.text, node, itemIndex, `content[${index}].text`);
			const alignment = raw.alignment as Alignment | undefined;
			if (raw.type === 'heading') {
				if (raw.level !== undefined && ![1, 2, 3].includes(raw.level as number)) {
					fail(node, itemIndex, `content[${index}].level must be 1, 2, or 3`);
				}
				return { type: 'heading', level: raw.level as 1 | 2 | 3 | undefined, text, alignment };
			}
			return { type: 'paragraph', text, alignment };
		}
		case 'list': {
			if (!Array.isArray(raw.items)) {
				fail(node, itemIndex, `content[${index}].items must be an array`);
			}
			const items = raw.items.map((item, itemPos) =>
				validateInlineText(item, node, itemIndex, `content[${index}].items[${itemPos}]`),
			);
			return { type: 'list', items, ordered: raw.ordered === true };
		}
		case 'table': {
			if (!Array.isArray(raw.rows)) {
				fail(node, itemIndex, `content[${index}].rows must be an array of arrays of strings`);
			}
			if (raw.headers !== undefined && !Array.isArray(raw.headers)) {
				fail(node, itemIndex, `content[${index}].headers must be an array of strings`);
			}
			return {
				type: 'table',
				headers: raw.headers as string[] | undefined,
				rows: raw.rows as string[][],
			};
		}
		case 'code': {
			if (typeof raw.text !== 'string') {
				fail(node, itemIndex, `content[${index}].text must be a string`);
			}
			return { type: 'code', text: raw.text };
		}
		case 'image': {
			if (typeof raw.binaryPropertyName !== 'string' || raw.binaryPropertyName.length === 0) {
				fail(node, itemIndex, `content[${index}].binaryPropertyName must be a non-empty string`);
			}
			// `buffer` is resolved from the binary property below, in
			// `fromTemplateExecute` (this validator has no `IExecuteFunctions`
			// access) — placeholder here, overwritten before rendering.
			return {
				type: 'image',
				buffer: Buffer.alloc(0),
				width: raw.width as number | undefined,
				height: raw.height as number | undefined,
			};
		}
		default:
			return { type: 'pageBreak' };
	}
}

interface ParsedTemplate {
	blocks: DocBlock[];
	imageBinaryPropertyNames: string[];
	renderOptions: DocRenderOptions;
}

function parseTemplate(raw: unknown, node: INode, itemIndex: number): ParsedTemplate {
	if (!isPlainObject(raw)) {
		fail(node, itemIndex, 'the template must be a JSON object with a "content" array');
	}
	if (!Array.isArray(raw.content)) {
		fail(node, itemIndex, '"content" must be an array of blocks');
	}

	const imageBinaryPropertyNames: string[] = [];
	const blocks = raw.content.map((block, index) => {
		const validated = validateBlock(block, node, itemIndex, index);
		if (validated.type === 'image') {
			imageBinaryPropertyNames.push((block as { binaryPropertyName: string }).binaryPropertyName);
		}
		return validated;
	});

	const pageSize = raw.pageSize as 'a4' | 'letter' | undefined;
	const margins = raw.margins as DocRenderOptions['margins'];
	const header =
		raw.header === undefined ? undefined : validateInlineText(raw.header, node, itemIndex, 'header');
	const footer =
		raw.footer === undefined ? undefined : validateInlineText(raw.footer, node, itemIndex, 'footer');

	return {
		blocks,
		imageBinaryPropertyNames,
		renderOptions: { pageSize, margins, header, footer, pageNumbers: raw.pageNumbers === true },
	};
}

// Implemented with a pdf-lib-based layout engine (`shared/docRenderer.ts`),
// NOT pdfmake — see that module's doc comment for why: pdfmake's Node/pdfkit
// path reads standard-font AFM metrics off disk
// (`fs.readFileSync(__dirname + ...)`, a hard "no filesystem access at
// runtime" conflict, not just a scanner lint issue) and both that path and
// pdfmake's browser bundle pull in dozens of `no-restricted-globals`
// violations from transitive deps (fontkit/linebreak/js-md5) — an order of
// magnitude past pdf-lib's one legitimately-shimmable `setTimeout` call.
export async function fromTemplateExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const rawTemplate = this.getNodeParameter('template', itemIndex, {});
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
		customFontBinaryPropertyName?: string;
	};

	if (options.customFontBinaryPropertyName) {
		throw new NodeOperationError(
			this.getNode(),
			'From Template: custom font embedding via a binary input is not yet supported — this operation\'s ' +
				'pdf-lib-based renderer only has the bundled Noto Sans/Noto Sans Mono/Noto Emoji faces available. ' +
				"See the README's Generate section.",
			{ itemIndex },
		);
	}

	const { blocks, imageBinaryPropertyNames, renderOptions } = parseTemplate(
		rawTemplate,
		this.getNode(),
		itemIndex,
	);

	let imageIndex = 0;
	for (const block of blocks) {
		if (block.type !== 'image') continue;
		const binaryPropertyName = imageBinaryPropertyNames[imageIndex++];
		this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
		const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
		assertBinarySizeWithinLimit(buffer, this.getNode(), binaryPropertyName, itemIndex);
		block.buffer = buffer;
	}

	const pdf = await PDFDocument.create();
	const { pageCount } = await renderDocument(pdf, blocks, renderOptions, this.getNode(), 'From Template', itemIndex);

	const outputFileName = options.outputFileName ?? 'generated.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { pageCount },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
