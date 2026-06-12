# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
