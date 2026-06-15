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

- `spike/drive-analyze.mjs`: a committed repro script that npm-packs this
  package, unpacks the tarball into a git-ignored temp dir, and runs the
  n8n community-node scanner's own `analyzePackage()` against it, printing
  every violation and exiting non-zero on any. Replaces an ad-hoc,
  previously-uncommitted script used for the same check. Run via
  `npm run spike:analyze`.

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
