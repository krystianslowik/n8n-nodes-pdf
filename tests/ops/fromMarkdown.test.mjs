/**
 * Generate > From Markdown. Shares the pdf-lib-based layout engine
 * (`shared/docRenderer.ts`) with From Template, via the hand-written parser
 * in `shared/markdown.ts` (unit-tested directly in `tests/shared/markdown.test.mjs`).
 *
 * As with `fromTemplate.test.mjs`, most assertions search for single-word
 * markers (each word is its own `Tj` operator in the output). Since
 * `drawLine` draws inter-word spaces as real glyphs (see `docRenderer.ts`),
 * multi-word phrases within one wrapped line CAN also be asserted — but not
 * across line breaks, which still concatenate with no separator.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { createMockExecuteFunctions, decodeOutputPdfBuffer } from '../mock-execute.mjs';
import { createPdfToolkitInstance } from '../load-dist.mjs';
import { extractDrawnText, findBlankDrawnGlyphs, pageHasEmbeddedFontNamed } from '../pdf-content.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument, PDFDict, PDFName, PDFString } = require('pdf-lib');

// Recreates the structure of the user-reported document: H1, blockquote with
// an em-dash attribution, H2 sections, bold/italic/inline-code, an ordered
// list with inline code + em-dashes, a bash code fence, a pipe table, a
// bullet list with strikethrough + a link, a thematic break, an italic footer.
const GOLDEN_MARKDOWN = [
	'# PDF Toolkit',
	'',
	'> "Make it boring." — *The Docs Team*',
	'',
	'## Features',
	'',
	'**Bold** and *italic* and `inline code`.',
	'',
	'1. `merge` — combine PDFs',
	'2. `split` — separate pages',
	'',
	'```bash',
	'npm install n8n-nodes-pdf',
	'npx n8n start',
	'```',
	'',
	'## Feature Matrix',
	'',
	'| Feature | Status |',
	'| --- | --- |',
	'| Merge | done |',
	'| Split | done |',
	'',
	'## Notes',
	'',
	'- ~~old syntax~~ removed',
	'- see [docs](https://example.com)',
	'',
	'---',
	'',
	'*Made with care — updated every Tuesday, for the whole team.*',
].join('\n');

const SAMPLE_MARKDOWN = `# Headingword

Paragraphword with **Boldword** and *Italicword*.

- Bulletword

1. Numberedword

\`\`\`
Codewordline
\`\`\`

| Headerword |
| --- |
| Cellword |
`;

export const tests = [
	{
		name: 'renders a full sample (heading, paragraph with bold/italic, lists, code, table) into a non-empty PDF',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: SAMPLE_MARKDOWN,
				options: { outputBinaryPropertyName: 'data', outputFileName: 'document.pdf' },
			});

			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.equal(returnData.length, 1);
			assert.ok(returnData[0].json.pageCount >= 1);

			const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
			assert.ok(outputBuffer.length > 0);
			const outputPdf = await PDFDocument.load(outputBuffer);
			assert.ok(outputPdf.getPageCount() >= 1);

			const drawnText = extractDrawnText(outputPdf, 0);
			for (const word of [
				'Headingword',
				'Paragraphword',
				'Boldword',
				'Italicword',
				'Bulletword',
				'Numberedword',
				'Codewordline',
				'Headerword',
				'Cellword',
			]) {
				assert.ok(drawnText.includes(word), `expected drawn text to include "${word}", got: ${drawnText}`);
			}
		},
	},
	{
		name: 'empty Markdown input produces a valid, loadable, single (blank) page PDF rather than throwing',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: '',
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			// The layout engine always starts on a page (constructed up front, see
			// `Layout`'s constructor in docRenderer.ts) even with zero content
			// blocks — so "empty input" is 1 blank page, not 0 pages.
			assert.equal(outputPdf.getPageCount(), 1);
			assert.equal(returnData[0].json.pageCount, 1);
		},
	},
	{
		// Regression test for the reported bug: pdf-lib's standard-14 fonts are
		// WinAnsi-only and throw "WinAnsi cannot encode ..." for Latin
		// Extended-A (ł/ż), Cyrillic, or Greek — `shared/fonts.ts`'s bundled
		// Noto Sans face covers all three in one embed.
		name: 'Polish/Cyrillic/Greek text ("Zażółć gęślą jaźń — Слово — Λόγος") does not throw and embeds a Noto Sans subset',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: 'Zażółć gęślą jaźń — Слово — Λόγος',
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputBuffer = decodeOutputPdfBuffer(returnData[0]);
			const outputPdf = await PDFDocument.load(outputBuffer);
			assert.ok(outputPdf.getPageCount() >= 1);
			assert.ok(returnData[0].json.pageCount >= 1);

			const drawnText = extractDrawnText(outputPdf, 0);
			assert.ok(drawnText.includes('Zażółć'), drawnText);
			assert.ok(drawnText.includes('Слово'), drawnText);
			assert.ok(drawnText.includes('Λόγος'), drawnText);

			// A real, structural signal that the Noto Sans face was actually
			// embedded (not just that some font was) — see
			// `pageHasEmbeddedFontNamed`'s doc comment for why this reads the
			// parsed /Font resource rather than grepping the raw saved bytes.
			assert.ok(
				pageHasEmbeddedFontNamed(outputPdf, 0, 'NotoSans-Regular'),
				'expected an embedded NotoSans-Regular subset',
			);
		},
	},
	{
		name: 'emoji text ("Rocket 🚀 done ✅") does not throw and loads back as a valid PDF',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: 'Rocket 🚀 done ✅',
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			assert.ok(outputPdf.getPageCount() >= 1);

			const drawnText = extractDrawnText(outputPdf, 0);
			assert.ok(drawnText.includes('Rocket'), drawnText);
			assert.ok(drawnText.includes('done'), drawnText);
			assert.ok(drawnText.includes('🚀'), drawnText);
			assert.ok(drawnText.includes('✅'), drawnText);
		},
	},
	{
		// Regression test for the `@pdf-lib/fontkit` TTF-subset corruption
		// (see `findBlankDrawnGlyphs`'s doc comment and
		// `scripts/shims/fontkit-patch.mjs`'s "TTFSubset loca-format
		// truncation" patch): the text-level assertions above all pass on a
		// corrupt document because the ToUnicode CMap survives — only the
		// glyph OUTLINES are lost. This drives every embedded face (regular,
		// bold, italic, bold-italic, mono, emoji) plus Latin-Extended
		// composites through one document and asserts each drawn glyph's
		// outline actually exists in the saved font program.
		name: 'every drawn glyph across all six faces has a real outline in the embedded subset (loca-truncation regression)',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: [
					'# Raport Słowika 🚀',
					'',
					'Zażółć gęślą jaźń — **done ✅** and *loved ❤️* and ***both***',
					'',
					'- Fire: 🔥 Party: 🎉 Smile: 😀',
					'',
					'`code block`',
				].join('\n'),
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));

			const blank = findBlankDrawnGlyphs(outputPdf, 0);
			assert.deepEqual(
				blank,
				[],
				`expected every drawn glyph to have an outline, but these are blank/corrupt: ${JSON.stringify(blank)}`,
			);
		},
	},
	{
		// A Private Use Area codepoint has no glyph in either the bundled Noto
		// Sans or Noto Emoji face — `shared/fonts.ts`'s `assertCoverage` must
		// turn that into a clear, named `NodeOperationError` instead of
		// fontkit silently drawing a blank/`.notdef` glyph.
		name: 'a character neither bundled font covers (Private Use Area U+E000) throws a clear NodeOperationError naming it',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: 'beforeafter',
				options: {},
			});
			await assert.rejects(
				() => createPdfToolkitInstance().execute.call(mockThis),
				(error) => {
					assert.match(error.message, /U\+E000/);
					assert.match(error.message, /From Markdown/);
					return true;
				},
			);
		},
	},
	{
		// Golden regression for the user-reported rendering bugs: every
		// construct in GOLDEN_MARKDOWN renders, and no raw markdown syntax
		// (">", "~~", "[docs](", "---") survives into the drawn text.
		name: 'golden document (quote, lists, code fence, table, strike, link, hr, italic footer) renders with no raw syntax leaking',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: GOLDEN_MARKDOWN,
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			assert.ok(returnData[0].json.pageCount >= 1);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			assert.ok(outputPdf.getPageCount() >= 1);

			const drawnText = extractDrawnText(outputPdf, 0);
			// Code-block text must be drawn (black-box regression: the background
			// rect used to be a default-black FILL painted over the text).
			assert.ok(drawnText.includes('npm install n8n-nodes-pdf'), drawnText);
			assert.ok(drawnText.includes('npx n8n start'), drawnText);
			// Blockquote parsed: content present, marker stripped.
			assert.ok(drawnText.includes('"Make it boring."'), drawnText);
			assert.ok(!drawnText.includes('>'), `literal ">" leaked: ${drawnText}`);
			// Strikethrough/link/hr parsed: no raw delimiter syntax drawn.
			assert.ok(drawnText.includes('old syntax'), drawnText);
			assert.ok(!drawnText.includes('~~'), `literal "~~" leaked: ${drawnText}`);
			assert.ok(drawnText.includes('docs'), drawnText);
			assert.ok(!drawnText.includes('[docs]('), `raw link syntax leaked: ${drawnText}`);
			assert.ok(!drawnText.includes('---'), `literal "---" leaked: ${drawnText}`);
		},
	},
	{
		// drawLine draws inter-word spaces as real glyphs (not just x-advances),
		// so extractDrawnText faithfully proves the run-boundary space survived:
		// a dropped space would extract as "Tuesday,for".
		name: 'a space at a styled-run boundary ("*Tuesday,* for") survives into the drawn text',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: GOLDEN_MARKDOWN,
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));
			const drawnText = extractDrawnText(outputPdf, 0);
			assert.ok(drawnText.includes('Tuesday, for the whole team.'), drawnText);
			assert.ok(!drawnText.includes('Tuesday,for'), drawnText);
		},
	},
	{
		name: 'the [docs](https://example.com) link becomes a clickable /Link annotation with the exact URI',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: 'see [docs](https://example.com) here',
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));

			const annots = outputPdf.getPages()[0].node.Annots();
			assert.ok(annots && annots.size() >= 1, 'expected at least one link annotation');
			const annotation = outputPdf.context.lookup(annots.get(0), PDFDict);
			assert.equal(annotation.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText(), 'Link');
			const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict);
			assert.equal(action?.lookupMaybe(PDFName.of('URI'), PDFString)?.decodeText(), 'https://example.com');
		},
	},
	{
		// The renderer does not expose layout positions, so this reads them back
		// from the saved content stream: the code-block background box is the
		// `0.95 0.95 0.95 rg` filled path (its `cm` translate y = box bottom),
		// and the heading is the last text shown (last `Tm` y = its baseline).
		name: 'a heading after a code block clears the block: baseline sits >= fontSize + spacing below the box bottom',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: '```\ncodeline\n```\n\n## HeadingAfter\n',
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));

			const { getPageContentText } = await import('../pdf-content.mjs');
			const content = getPageContentText(outputPdf, 0);
			const fillIndex = content.indexOf('0.95 0.95 0.95 rg');
			assert.ok(fillIndex >= 0, 'expected a light-gray code-block fill');
			const boxCm = /1 0 0 1 ([\d.]+) ([\d.]+) cm/.exec(content.slice(fillIndex));
			assert.ok(boxCm, 'expected the code-block box translate');
			const boxBottomY = Number(boxCm[2]);

			const tmMatches = [...content.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm/g)];
			const headingBaselineY = Number(tmMatches[tmMatches.length - 1][1]);
			// Heading font size is 17 (H2); baseline = block top - fontSize, so a
			// correct 10pt block margin puts the baseline 27 below the box bottom.
			assert.ok(
				boxBottomY - headingBaselineY >= 17 + 8,
				`heading baseline ${headingBaselineY} crowds code box bottom ${boxBottomY}`,
			);
		},
	},
	{
		// Same idea for a table: its bottom rule is the lowest `m`/`l` path
		// coordinate drawn, the heading is the last `Tm`.
		name: 'a heading after a table clears the table bottom rule by the block margin',
		fn: async () => {
			const items = [{ json: {} }];
			const mockThis = createMockExecuteFunctions(items, {
				resource: 'generate',
				operation: 'fromMarkdown',
				markdown: '| A |\n| --- |\n| 1 |\n\n## HeadingAfter\n',
				options: {},
			});
			const [returnData] = await createPdfToolkitInstance().execute.call(mockThis);
			const outputPdf = await PDFDocument.load(decodeOutputPdfBuffer(returnData[0]));

			const { getPageContentText } = await import('../pdf-content.mjs');
			const content = getPageContentText(outputPdf, 0);
			const lineYs = [...content.matchAll(/[\d.]+ ([\d.]+) [ml]\b/g)].map((m) => Number(m[1]));
			assert.ok(lineYs.length > 0, 'expected table rule path operators');
			const tableBottomY = Math.min(...lineYs);

			const tmMatches = [...content.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm/g)];
			const headingBaselineY = Number(tmMatches[tmMatches.length - 1][1]);
			assert.ok(
				tableBottomY - headingBaselineY >= 17 + 8,
				`heading baseline ${headingBaselineY} crowds table bottom ${tableBottomY}`,
			);
		},
	},
];
