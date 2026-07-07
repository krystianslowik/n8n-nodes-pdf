# Changelog

All notable changes to this project will be documented in this file.

## 0.2.3 - 2026-07-07

Documentation and comment cleanup, no functional changes: added a workflow
screenshot to the README, removed the n8n-nodes-pdfkit migration section,
and refreshed code comments that still described the pre-0.2.0 scaffold
state.

## 0.2.2 - 2026-07-07

Removed Extract > Text and the Secure resource (Encrypt, Decrypt, Set
Permissions) from the node UI. They were never functional — engine-blocked
stubs since 0.2.0 that always threw a clear "not available" error (see
0.2.0's changelog entry for the pdfjs-dist/qpdf-wasm blockers) — and a
removed menu entry is cleaner than a dead one users could still click into.
They return if/when a scanner-compatible engine exists for text extraction
or PDF encryption. The node now has 5 resources / 18 operations, all
functional.

## 0.2.1 - 2026-07-07

Unicode and emoji text support for every text-drawing operation. Generate
(From Template / From Markdown), Stamp (Text Watermark / Page Numbers), and
Form (Fill Form) previously used pdf-lib's built-in WinAnsi-encoded fonts,
so any character outside Latin-1 (e.g. Polish "ł", Cyrillic, Greek, emoji)
threw a raw `WinAnsi cannot encode` error. These operations now use bundled
Noto Sans / Noto Sans Mono faces embedded via `@pdf-lib/fontkit` (subset at
save time, so output PDFs stay small), with monochrome Noto Emoji as a
per-run fallback for pictographic characters in Generate and Stamp. Known
boundaries, documented in the README: emoji render monochrome only; ZWJ
sequences may render as their component emoji; skin-tone modifiers may
drop. Fill Form regenerates field appearances with the embedded Unicode
font, but pdf-lib draws one field's whole appearance with a single font, so
an emoji in a field value throws a clear error naming the field instead of
producing a blank appearance. Characters no bundled font covers throw a
clear error naming the codepoint (as U+XXXX) and operation. The bundled
dist grows from ~1.1 MB to ~7.6 MB (six inlined font files). Font
licenses: see `THIRD_PARTY_NOTICES.md` (OFL-1.1), referenced from the
README.

Fixed a font-subset corruption bug in the bundled `@pdf-lib/fontkit`
(1.1.1): its TTF subsetter re-derives the `loca` offset format from the
subset's size and picks the short format (offsets stored ÷ 2) without
padding glyph records to even lengths, so one odd-length glyph record
misaligned every glyph after it — the saved font program had the right
glyph count but mostly empty outlines, rendering most characters blank in
every PDF viewer. Patched at build time to inherit the source font's `loca`
format (the same fix upstream fontkit shipped in 2.x); see
`scripts/shims/fontkit-patch.mjs` and the "every drawn glyph … has a real
outline" regression test.

Fixed user-reported Generate rendering bugs (From Markdown / From
Template's shared layout engine): fenced code blocks rendered as a solid
black rectangle — the background `drawRectangle` call passed neither
`color` nor `borderColor`, so pdf-lib defaulted to a black FILL painted
over the already-drawn code text; code blocks now draw a light-gray
background box first, then dark monospace text on top. Blockquotes (`>`,
multi-line, inline styles intact), `[text](url)` links (underlined +
clickable URI annotation), `~~strikethrough~~` (real line-through), and
horizontal rules (`---`/`***`/`___`, CommonMark thematic-break rules — a
`---` directly under paragraph text is a setext level-2 heading instead)
are now parsed and rendered instead of showing raw syntax. Unsupported
inline forms degrade to clean text (`![alt](url)` renders the alt text,
`[text][ref]` renders the text). Vertical spacing is normalized: text
baselines now sit a font-size below the block cursor, so headings after a
table or code block no longer overlap the previous block, and every block
type leaves the same 10pt bottom margin. Inter-word spaces are drawn as
real space glyphs (previously pure x-positioning), so text
extraction/copy-paste from generated PDFs keeps spaces ("Tuesday, for"
no longer extracts as "Tuesday,for").

## 0.2.0 - 2026-07-07

**Summary:** 0.1.0 shipped only the node's UI/scaffold — every one of the 22
operations across the six resources (Document, Generate, Form, Stamp,
Extract, Secure) threw a bare "not implemented yet" error. 0.2.0 implements
18 of those 22 for real against the bundled `pdf-lib` (Document's 6
operations, Generate's 3, Form's 2, Stamp's 4, and Extract's Metadata/
Embedded Images/Page Count), backed by 89 tests in `tests/` that drive the
actual built `dist/` artifact through a shared mocked `IExecuteFunctions`.
The remaining 4 (Extract > Text, and Secure's Encrypt/Decrypt/Set
Permissions) stay stubs — each depends on an engine (`pdfjs-dist` or
`qpdf-wasm`) that cannot currently be bundled scanner-clean for this
package, and each now throws a `NodeOperationError` naming the specific
blocker instead of a generic "not implemented" message. `npm run build`,
`npm run lint` (full n8n Cloud config, `n8n.strict: true`), and
`npm run scan` (the scanner's own `analyzePackage()`, run locally against
the packed tarball) all stay green throughout — zero runtime dependencies,
two justified `eslint-disable-next-line` suppressions (both on the
bundled-away `pdf-lib` import line, see below).

### Changed

- Restored the full n8n Cloud lint config (`eslint.config.mjs` back to
  `@n8n/node-cli/eslint`'s `config`, `package.json`'s `n8n.strict` back to
  `true`) after an earlier pass had disabled cloud support package-wide to
  silence a lint error. The two `no-restricted-imports` hits this
  re-enables (the `pdf-lib` import lines in `merge.ts`/`pageCount.ts`, which
  never ship — esbuild bundles them away) are now suppressed individually
  with a narrow `eslint-disable-next-line` and a justification comment
  instead.
- The esbuild bundle step (`scripts/esbuild-bundle.mjs`) now injects
  `scripts/shims/yield.js`, which redirects pdf-lib's internal
  `waitForTick()` (used on every `PDFDocument.load()`/`.save()` call) from
  the banned `setTimeout` global to `queueMicrotask`. This closes the last
  `@n8n/community-nodes/no-restricted-globals` violation the scanner
  reported against the bundled dist — `analyzePackage()` now reports 0
  errors (down from 1) — but it is a documented tradeoff, not a full fix:
  `queueMicrotask` doesn't yield to the timer/IO phase the way
  `setTimeout`/`setImmediate` would (both are also banned globals). See
  `scripts/shims/yield.js` for the full event-loop-starvation tradeoff
  writeup.

### Added

- Document > Split, Extract Pages, Rotate, Reorder, and Delete Pages are now
  implemented for real with `pdf-lib`, replacing their stubs (Document >
  Merge and Extract > Page Count were already real). Split parses its
  `Page Ranges` expression and emits **one output item per comma-separated
  range** (batch-aware); Extract Pages flattens the same expression
  into a single, deduplicated selection for one output PDF; Rotate honors
  "all" or a page-range selection and *adds* the chosen angle to each page's
  existing rotation; Reorder validates its `New Order` expression as a
  complete permutation of the document's pages before reordering; Delete
  Pages removes highest-index-first and refuses to delete every page. Page-
  range parsing (`1-3,7,9-`-style expressions, including open-ended ranges)
  is centralized in a new, unit-tested `nodes/PdfToolkit/shared/pageRanges.ts`
  shared by all four range-consuming operations, and a new
  `nodes/PdfToolkit/shared/pdf.ts` centralizes the `pdf-lib` import (behind
  the same `no-restricted-imports` suppression pattern as `merge.ts`), a
  100MB binary-size guard, and pdf-lib parse-error wrapping so failures
  name the failing binary property/item instead of surfacing a raw pdf-lib
  stack trace.
- `tests/run-all.mjs`: a lightweight test runner (discovers every
  `tests/**/*.test.mjs`, no external test-runner dependency) that drives the
  REAL, BUILT dist artifact through a shared mocked `IExecuteFunctions`
  (`tests/mock-execute.mjs`) for every Document operation, plus a
  `tests/shared/pageRanges.test.mjs` unit-testing the range parser directly
  (valid/open-ended/overlapping/invalid/out-of-range cases) via an
  esbuild-on-the-fly loader (`tests/util/load-ts.mjs`). Run with
  `npm run build && node tests/run-all.mjs`.
- `scripts/scan-check.mjs`: a committed repro script that npm-packs this
  package, unpacks the tarball into a git-ignored temp dir, and runs the
  n8n community-node scanner's own `analyzePackage()` against it, printing
  every violation and exiting non-zero on any. Replaces an ad-hoc,
  previously-uncommitted script used for the same check. Run via
  `npm run scan`.
- Form > Read Fields and Form > Fill Form are now implemented for real with
  `pdf-lib`. Read Fields maps `PDFDocument.getForm().getFields()` to
  name/type/current-value/options JSON, dispatching on each field's concrete
  pdf-lib subclass (`PDFCheckBox`/`PDFRadioGroup`/`PDFDropdown`/
  `PDFOptionList`/`PDFTextField`/`PDFButton`/`PDFSignature`) via `instanceof`.
  Fill Form sets each named field from the "Field Values" JSON param the same
  way, with an optional `form.flatten()`; an unknown field name or an invalid
  dropdown/radio-group/option-list selection throws a `NodeOperationError`
  naming the specific field, instead of a raw pdf-lib error or (for
  dropdowns, which pdf-lib itself lets silently become free text) silently
  accepting a typo.
- Stamp > Text Watermark, Image Watermark, Page Numbers, and Overlay PDF are
  now implemented for real with `pdf-lib`. Text/Image Watermark apply to
  "all" pages or a page-range expression (same convention as Document >
  Rotate) with configurable position/opacity/rotation/scale via a new shared
  `nodes/PdfToolkit/shared/stampPosition.ts` (7-anchor box-positioning
  helper shared by all three text/image stamp ops); Image Watermark sniffs
  PNG-vs-JPEG by magic-number signature before calling pdf-lib's
  format-specific `embedPng`/`embedJpg`; Page Numbers substitutes
  `{page}`/`{pages}` in a format template and applies to every page; Overlay
  PDF supports "repeat first page" and "matching pages" modes via
  `PDFDocument.embedPdf()` (pdf-lib's `embedPage`/`embedPages` wrapper) +
  `page.drawPage()`.
- `tests/pdf-content.mjs`: since pdf-lib has no text-extraction API, the new
  Stamp tests assert two honest, structural things instead of rendered text —
  content-stream byte-length growth per page, and the hex-encoded operand of
  the expected drawn string inside the page's decoded (un-Flate-compressed)
  content stream. `tests/fixtures.mjs` gained `makeTinyPng` (a hand-built,
  CRC-valid 1×1 PNG, for Image Watermark tests) and `tests/mock-execute.mjs`
  gained `itemWithBinaries` (one item, several named binary properties, for
  ops that consume two binaries — Image Watermark's base PDF + image,
  Overlay PDF's base + overlay PDF).

### Fixed

- `execute()` in `PdfToolkit.node.ts` now dispatches by item cardinality
  instead of a single flat per-item loop, so it can actually support
  batch-aware operations (merge N items → 1; split 1 → N items):
  Document > Merge is called once with every incoming item and produces one
  output item (many-to-one), and Document > Split is still called once per
  incoming item but may push zero or more output items (one-to-many).
- Document > Merge gained the missing **Merge From** parameter
  (`All Incoming Items` / `Listed Binary Properties`), so the "or listed
  binary properties" mode promised by the scaffold spec and the README is
  now actually configurable, not just documented.
- Extract > Embedded Images' `Output Binary Property Prefix` option (instead
  of the usual `Output Binary Property` + `Output File Name` pair) is now
  called out in-code and in the README as an intentional exception, since
  that operation can emit any number of images per PDF.
- Generate > From Images is now dispatched many-to-one (all incoming image
  items combined into one output PDF), matching its own description text
  ("Images are added in input order") and giving parity with
  n8n-nodes-pdfkit's images→PDF operation. It was previously wired itemwise,
  which would have produced N
  separate 1-page PDFs instead of one combined N-page PDF — the same bug
  class already fixed for Document > Merge above.

### Added (Extract > Metadata, Embedded Images)

- Extract > Metadata is now implemented for real with `pdf-lib` (title,
  author, subject, keywords, creator, producer, creation/modification dates,
  page count). Loads with `updateMetadata: false`: pdf-lib's
  default (`true`) unconditionally overwrites `Producer`/`ModificationDate`
  with its own stamp on every `load()`, which would make a read-only
  metadata op report pdf-lib's values instead of the document's real ones
  (see the new `loadPdfDocument()` doc comment in `shared/pdf.ts`). No
  write/set-metadata variant is scaffolded anywhere in the UI, so only the
  read half is implemented.
- Extract > Embedded Images is now implemented for real with pdf-lib's raw
  PDF object model (no `pdfjs-dist` needed — see below). Walks every page's
  `/Resources /XObject` dictionary and extracts each `/Subtype /Image`
  stream's raw bytes, deduplicating images reused across multiple pages.
  **Only `DCTDecode` (JPEG) images are supported** — a raw XObject stream's
  bytes ARE a complete, valid image file only for that filter; every other
  filter (`FlateDecode` — e.g. pdf-lib's own `embedPng` output, raw pixel
  samples, not a PNG file; `CCITTFaxDecode`; `JPXDecode`) would require real
  image-codec decode/re-encode work this operation does not do, and now
  throws a clear `NodeOperationError` naming the unsupported filter instead
  of silently emitting corrupt output. Documented in the op's UI description
  and the README.
- `tests/fixtures.mjs` gained `makeTinyJpg()` (a committed, base64-inlined 4x4
  baseline JPEG — unlike the hand-built PNG helper, a byte-correct JPEG needs
  a real DCT/Huffman encoder, out of scope to write from scratch), returning
  a `Buffer` with `byteOffset === 0` specifically to sidestep a pdf-lib
  `embedJpg()` bug where `new DataView(buf.buffer)` ignores a pooled Node
  `Buffer`'s `byteOffset` and misreads the JPEG header.
- Evaluated bundling `pdfjs-dist` for Extract > Text: its Node support model
  (worker/message-passing architecture requiring either a runtime dynamic
  `import()` of a file on disk, or reimplementing its internal, undocumented
  wire protocol; a `process`-global dependency for environment detection; a
  much larger banned-global surface than pdf-lib's single `setTimeout` call,
  mostly from unrelated bundled web-viewer UI code) is architecturally
  incompatible with this package's constraints. Extract > Text remains a
  stub (unchanged).

## 0.1.0 - 2026-07-06

### Added

- Initial scaffold: full node UI (6 resources, 22 operations) and `execute()`
  routing; all operation bodies are stubs pending a decision on how to bundle
  the underlying PDF libraries scanner-clean.
