# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- Restored the full n8n Cloud lint config (`eslint.config.mjs` back to
  `@n8n/node-cli/eslint`'s `config`, `package.json`'s `n8n.strict` back to
  `true`) after a prior spike pass had disabled cloud support package-wide
  to silence a lint error. The two `no-restricted-imports` hits this
  re-enables (the `pdf-lib` import lines in `merge.ts`/`pageCount.ts`, which
  never ship — esbuild bundles them away) are now suppressed individually
  with a narrow `eslint-disable-next-line` and a justification comment
  instead. See `spike/FINDINGS.md` Q2 "Round 2" for the full rationale.
- The esbuild bundle step (`scripts/esbuild-bundle.mjs`) now injects
  `scripts/shims/yield.js`, which redirects pdf-lib's internal
  `waitForTick()` (used on every `PDFDocument.load()`/`.save()` call) from
  the banned `setTimeout` global to `queueMicrotask`. This closes the last
  `@n8n/community-nodes/no-restricted-globals` violation the scanner
  reported against the bundled dist — `analyzePackage()` now reports 0
  errors (down from 1) — but it is an honest, documented tradeoff, not a
  full fix: `queueMicrotask` doesn't yield to the timer/IO phase the way
  `setTimeout`/`setImmediate` would (both are also banned globals). See
  `scripts/shims/yield.js` and `spike/FINDINGS.md` Q2 for the full
  event-loop-starvation tradeoff writeup (PRD R2).

### Added

- Document > Split, Extract Pages, Rotate, Reorder, and Delete Pages are now
  implemented for real with `pdf-lib`, replacing their stubs (Document >
  Merge and Extract > Page Count were already real). Split parses its
  `Page Ranges` expression and emits **one output item per comma-separated
  range** (PRD batch-awareness); Extract Pages flattens the same expression
  into a single, deduplicated selection for one output PDF; Rotate honors
  "all" or a page-range selection and *adds* the chosen angle to each page's
  existing rotation; Reorder validates its `New Order` expression as a
  complete permutation of the document's pages before reordering; Delete
  Pages removes highest-index-first and refuses to delete every page. Page-
  range parsing (`1-3,7,9-`-style expressions, including open-ended ranges)
  is centralized in a new, unit-tested `nodes/PdfToolkit/shared/pageRanges.ts`
  shared by all four range-consuming operations, and a new
  `nodes/PdfToolkit/shared/pdf.ts` centralizes the `pdf-lib` import (behind
  the same `no-restricted-imports` suppression pattern as `merge.ts`), a PRD
  R2 100MB binary-size guard, and pdf-lib parse-error wrapping so failures
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
- `spike/drive-analyze.mjs`: a committed repro script that npm-packs this
  package, unpacks the tarball into a git-ignored temp dir, and runs the
  n8n community-node scanner's own `analyzePackage()` against it, printing
  every violation and exiting non-zero on any. Replaces an ad-hoc,
  previously-uncommitted script used for the same check. Run via
  `npm run spike:analyze`.
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
  instead of a single flat per-item loop, so it can actually support the
  PRD's "Batch-aware: merge N items → 1; split 1 → N items" requirement:
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
  ("Images are added in input order") and PRD F7's pdfkit-node parity
  requirement. It was previously wired itemwise, which would have produced N
  separate 1-page PDFs instead of one combined N-page PDF — the same bug
  class already fixed for Document > Merge above.

## 0.1.0 - 2026-07-06

### Added

- Initial scaffold: full node UI (6 resources, 22 operations) and `execute()`
  routing; all operation bodies are stubs pending PRD open question O1.
