import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';

import { outputOptionsField } from '../../shared/descriptions';
import { renderDocument } from '../../shared/docRenderer';
import { parseMarkdown } from '../../shared/markdown';
import { PDFDocument, savePdfAsBinary } from '../../shared/pdf';

const showOnlyForFromMarkdown = { resource: ['generate'], operation: ['fromMarkdown'] };

export const fromMarkdownDescription: INodeProperties[] = [
	{
		displayName: 'Markdown',
		name: 'markdown',
		type: 'string',
		typeOptions: { rows: 10 },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForFromMarkdown },
		description:
			'Markdown source to render as a PDF. Supports headings (# .. ######), paragraphs with ' +
			'**bold**/*italic*/`code`/~~strikethrough~~/[link](url) spans, blockquotes (>), bullet ("-") and ' +
			'numbered ("1.") lists, fenced (```) code blocks, horizontal rules (---), and GFM-style pipe ' +
			'tables. This is a small hand-written subset of Markdown, not a full ' +
			'CommonMark implementation — see nodes/PdfToolkit/shared/markdown.ts for the exact supported ' +
			'grammar. Rendered with the same pdf-lib-based layout engine as Generate > From Template.',
	},
	outputOptionsField('generate', 'fromMarkdown', [], 'document.pdf'),
];

// Implemented with the hand-written Markdown parser (`shared/markdown.ts`)
// feeding the shared pdf-lib layout engine (`shared/docRenderer.ts`) — see
// that module's doc comment for why pdf-lib renders this instead of pdfmake.
export async function fromMarkdownExecute(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const markdown = this.getNodeParameter('markdown', itemIndex, '') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as {
		outputBinaryPropertyName?: string;
		outputFileName?: string;
	};

	const blocks = parseMarkdown(markdown);
	const pdf = await PDFDocument.create();
	const { pageCount } = await renderDocument(pdf, blocks, {}, this.getNode(), 'From Markdown', itemIndex);

	const outputFileName = options.outputFileName ?? 'document.pdf';
	const binaryData = await savePdfAsBinary(this, pdf, outputFileName);

	return {
		json: { pageCount },
		binary: { [options.outputBinaryPropertyName ?? 'data']: binaryData },
		pairedItem: itemIndex,
	};
}
