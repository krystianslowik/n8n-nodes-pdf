# n8n-nodes-pdf (PDF Toolkit)

This is an n8n community node. It lets you run common PDF operations —
merge, split, generate, fill forms, watermark, extract, and secure — **entirely
in-process on your own n8n instance**. There is no external API, no per-document
fee, and no data ever leaves your machine.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Example workflows](#example-workflows)
[Not yet supported](#not-yet-supported)
[Limits](#limits)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Status: partial implementation](#status-partial-implementation)
[Migrating from n8n-nodes-pdfkit](#migrating-from-n8n-nodes-pdfkit)
[Resources](#resources)
[Version history](#version-history)

## Installation

**Self-hosted:** follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
in the n8n community nodes documentation — from your n8n instance,
**Settings → Community Nodes → Install**, and enter `n8n-nodes-pdf`. No
credentials or extra setup are needed; every operation runs in-process
against binary data already in your workflow.

**n8n Cloud:** this package is **not yet verified** for the Cloud community
node catalog (see [Status: partial implementation](#status-partial-implementation)
and `VERIFICATION.md` for the honest, current state of that process). Once
verified, it will be installable the same way any other verified community
node is on Cloud — search for "PDF Toolkit" in the nodes panel, no self-hosted
install step required. Until then, Cloud users can't install unverified
community nodes at all; self-hosting is the only install path today.

## Operations

One node, **PDF Toolkit**, with six resources. Every operation reads its
input PDF from a binary property (default `data`) and, where it produces a
new file, writes it to a binary property under an **Options** collection
(`Output Binary Property`, default `data`; `Output File Name`).

### Document

| Operation | Description |
|---|---|
| Merge | Combine PDFs from all incoming items (or listed binary properties), preserving order |
| Split | Split a PDF into multiple output items by page ranges (e.g. `1-3,7,9-`) |
| Extract Pages | Extract a set of pages into a single new PDF |
| Rotate | Rotate one or more pages by 90°/180°/270° |
| Reorder | Change the order of pages |
| Delete Pages | Remove a set of pages |

**Item cardinality:** Merge and Split are the two Document operations that
don't map one input item to one output item. Merge has a **Merge From**
setting — **All Incoming Items** (default) reads one PDF per incoming item
from the same binary field, and **Listed Binary Properties** reads an
explicit, ordered, comma-separated list of binary field names (so a single
item carrying several named PDF binaries can be merged too) — either way, all
incoming items are combined into **one** output item. Split does the
opposite: **one** incoming item becomes **one output item per page range**
in its `Page Ranges` parameter. Generate → **From Images** (below) has the
same many-to-one cardinality as Merge: it reads one image per incoming item,
in input order, and combines them into **one** output PDF with one page per
image. Every other operation in this node is 1 input item → 1 output item.

### Generate

| Operation | Description |
|---|---|
| From Template | Generate a PDF from a declarative JSON template (heading/paragraph/list/table/code/image blocks, headers/footers, page numbers) |
| From Markdown | Generate a PDF from Markdown (headings, paragraphs with bold/italic/code spans, bullet/numbered lists, fenced code blocks, GFM pipe tables) |
| From Images | Combine one image per incoming item (in input order) into a single multi-page PDF — **drop-in `n8n-nodes-pdfkit` replacement** |

**Generate engine note:** all three operations are implemented with a small,
purpose-built `pdf-lib`-based layout engine
(`nodes/PdfToolkit/shared/docRenderer.ts`), **not** `pdfmake` (the PRD's
original engine choice for this resource). A genuine bundling attempt found
`pdfmake` architecturally incompatible with this package's scanner-clean /
no-filesystem constraints — see `spike/FINDINGS.md`'s "Q5 — pdfmake
bundling" for the full analysis. Known v0 boundaries of the fallback
renderer: only the bundled base fonts (Helvetica/Courier/Times — no
custom/embedded fonts, so From Template's **Custom Font Binary Property**
option throws a clear "not yet supported" error rather than silently
ignoring it), no nested lists, and equal-width table columns.

### Form

| Operation | Description |
|---|---|
| Read Fields | Read a PDF form's fields into JSON |
| Fill Form | Fill a PDF form from JSON values, with an optional "Flatten" step |

### Stamp

| Operation | Description |
|---|---|
| Text Watermark | Stamp text onto every page |
| Image Watermark | Stamp an image onto every page |
| Page Numbers | Add page numbers to every page |
| Overlay PDF | Overlay one PDF on top of another |

### Extract

| Operation | Description |
|---|---|
| Text | Extract per-page text, with an option to include coordinates |
| Metadata | Extract document metadata (title, author, dates, etc.) |
| Embedded Images | Extract images embedded in the PDF (**JPEG/DCTDecode only** — see note below) |
| Page Count | Get the number of pages in the PDF |

**Note:** Embedded Images is the one operation that deviates from the
"Output Binary Property + Output File Name" pair above — it can emit any
number of images per PDF, so it instead takes an **Output Binary Property
Prefix** (default `image`) and writes each extracted image to its own binary
field (`image0`, `image1`, ...) on the output item.

**Embedded Images filter support (documented boundary):** this operation
extracts an image XObject's raw stream bytes as-is, without decoding or
re-encoding any pixel data. That only produces a valid, standalone image
file for images using the `DCTDecode` (JPEG) filter — the overwhelmingly
common case for photos/scans embedded in real-world PDFs. Images using other
filters (`FlateDecode` — e.g. PNGs re-encoded by pdf-lib's own `embedPng`,
which stores raw decompressed pixel samples, not a PNG file; `CCITTFaxDecode`
— scanned fax/TIFF-style bilevel images; `JPXDecode` — JPEG2000) would
require real image-codec decode/re-encode work this operation does not do,
so it throws a clear `NodeOperationError` naming the unsupported filter
instead of silently producing corrupt output.

### Secure

| Operation | Description | Status |
|---|---|---|
| Encrypt | Password-protect a PDF | Stub (see below) |
| Decrypt | Remove password protection from a PDF | Stub (see below) |
| Set Permissions | Restrict printing, copying, editing, and other actions | Stub (see below) |

**Why these three are still stubs:** `pdf-lib` has no PDF
standard-security-handler (encryption) implementation at all — there is
simply no encrypt/decrypt/permissions code path to call. The PRD's suggested
alternative, a qpdf-wasm engine (PRD F10/O2), was genuinely evaluated for
this package and rejected: the two viable npm builds
(`@jspawn/qpdf-wasm`, `@neslinesli93/qpdf-wasm`) are Emscripten Node bundles
whose bootstrap code unconditionally references banned globals (`process`,
`__dirname`) and `require()`s banned built-in modules (`fs`, `path`) —
entangled throughout their Node-environment detection, not one isolated,
cleanly-substitutable call site the way pdf-lib's single `setTimeout` call
was (see `spike/FINDINGS.md`'s "Q2" for that fix). See `spike/FINDINGS.md`'s
"Q6 — qpdf-wasm eval" for the full evaluation, the one piece that IS
legitimately fixable (the WASM-bytes file load, via Emscripten's documented
`instantiateWasm` option), and viable future paths (a companion package per
PRD O3, a from-source Emscripten rebuild, or a from-scratch pure-JS
standard-security-handler implementation against pdf-lib + `node:crypto`).
Calling any of these three operations throws a `NodeOperationError` naming
the operation and this reason (not a raw library stack trace, and not just
"not implemented yet").

**PRD/scaffold note:** the PRD's operations table also lists "read/strip
metadata" under Secure. The scaffolded Secure UI has no such
parameter/operation to implement against — metadata *reading* lives under
**Extract → Metadata** (implemented for real) and there is no
metadata-*stripping* operation anywhere in this package yet. See
`spike/FINDINGS.md` "Q6" for this reconciliation note.

**Roadmap note (Tier 1 vs. Tier 2):** everything above is **Tier 1** — pure-JS,
verification-safe operations that ship in the core package. **Tier 2**
(HTML → PDF via a bring-your-own-browser CDP endpoint, and OCR/searchable-PDF
via `tesseract.js`) is explicitly **out of scope for this package** and is
being evaluated as a separate, self-hosted-first companion package so it
doesn't jeopardize this package's verification eligibility. See the PRD's
"Operations — Tier 2" section for details.

## Example workflows

Three copyable node-parameter snippets for the flagship operations — paste
the `parameters` object into a **PDF Toolkit** node (or the whole block into
an empty canvas as workflow JSON) and point **Binary Property** at whatever
binary field your previous node produced.

**Merge** — combine every incoming item's PDF (read from binary field `data`
on each) into one output item:

```json
{
  "parameters": {
    "resource": "document",
    "operation": "merge",
    "mergeFrom": "allItems",
    "binaryPropertyName": "data",
    "options": {
      "outputBinaryPropertyName": "data",
      "outputFileName": "merged.pdf"
    }
  },
  "name": "Merge PDFs",
  "type": "n8n-nodes-pdf.pdfToolkit",
  "typeVersion": 1,
  "position": [680, 300]
}
```

**Split** — split one incoming PDF into three output items by page range
(pages 1-3, page 7, and page 9 to the end):

```json
{
  "parameters": {
    "resource": "document",
    "operation": "split",
    "binaryPropertyName": "data",
    "pageRanges": "1-3,7,9-",
    "options": {
      "outputBinaryPropertyName": "data",
      "outputFileName": "split.pdf"
    }
  },
  "name": "Split PDF",
  "type": "n8n-nodes-pdf.pdfToolkit",
  "typeVersion": 1,
  "position": [680, 300]
}
```

**Generate → From Template** — render a declarative JSON document (PRD F3)
into a new PDF, with no input binary needed:

```json
{
  "parameters": {
    "resource": "generate",
    "operation": "fromTemplate",
    "template": "{\n  \"content\": [\n    { \"type\": \"heading\", \"level\": 1, \"text\": \"Invoice #1042\" },\n    { \"type\": \"paragraph\", \"text\": \"Thank you for your business.\" },\n    { \"type\": \"table\", \"headers\": [\"Item\", \"Qty\", \"Price\"], \"rows\": [[\"Widget\", \"2\", \"$10.00\"]] }\n  ],\n  \"pageNumbers\": true\n}",
    "options": {
      "outputBinaryPropertyName": "data",
      "outputFileName": "generated.pdf"
    }
  },
  "name": "Generate Invoice PDF",
  "type": "n8n-nodes-pdf.pdfToolkit",
  "typeVersion": 1,
  "position": [680, 300]
}
```

## Not yet supported

18 of this node's 22 operations are implemented for real (see
[Status: partial implementation](#status-partial-implementation) below for
the full breakdown). Four are honest, investigated stubs — each throws a
`NodeOperationError` naming the specific blocker instead of a bare
"not implemented" message, and each was genuinely evaluated (not just
skipped) against the library the PRD proposed for it:

| Resource → Operation | Why not | Investigated in |
|---|---|---|
| Extract → Text | The proposed engine, `pdfjs-dist`, could not be bundled scanner-clean: its Node-environment detection depends on the banned `process` global with no legitimate substitute, its worker architecture needs either a runtime dynamic `import()` of a file on disk or reimplementing an undocumented internal wire protocol, and it carries a much larger banned-globals surface than any other library this package bundles | `spike/FINDINGS.md` "Q4 — pdfjs-dist bundling" |
| Secure → Encrypt | The proposed engine, `qpdf-wasm`, has no npm build whose Emscripten Node bootstrap avoids the banned `process`/`__dirname` globals and `require('fs')`/`require('path')` — entangled throughout its Node-environment detection, not one isolated fixable call site | `spike/FINDINGS.md` "Q6 — qpdf-wasm eval" |
| Secure → Decrypt | Same `qpdf-wasm` blocker as Encrypt | `spike/FINDINGS.md` "Q6" |
| Secure → Set Permissions | Same `qpdf-wasm` blocker as Encrypt | `spike/FINDINGS.md` "Q6" |

None of these four are "not started" — each has a real evaluated engineering
boundary, documented with the exact library builds tried, the exact banned
globals hit, and the viable future paths (a companion package, a from-source
Emscripten rebuild, or a from-scratch pure-JS implementation against
`pdf-lib` + `node:crypto`). See `spike/FINDINGS.md` for the full write-ups
and `VERIFICATION.md` for how these fit into the overall submission state.

## Limits

- **100MB per-binary size guard (PRD R2).** Every operation that loads a PDF
  or image binary refuses inputs over 100MB with a clear error naming the
  binary property and item, instead of letting the underlying library
  attempt to parse an oversized buffer and fail unpredictably (or succeed
  and risk a memory blowup). This is a hard ceiling per binary, not a total
  workflow budget.
- **Memory expectations.** At the scale actually measured
  (`spike/harness.mjs`, 2-page/3-page/100-page test PDFs — see
  `spike/FINDINGS.md` "Q3"), peak process RSS during a merge stays within a
  few MB of the Node/V8/pdf-lib baseline (~140-150MB): merging a 2-page and
  a 100-page document together added only ~2-3MB of peak RSS over the
  baseline, because the PDF content itself (~22KB for the 100-page test
  document) is tiny compared to the interpreter's own footprint. In plain
  words: at the sizes tested, this node's memory use is dominated by Node
  itself starting up, not by the PDF you feed it. This has **not** been
  stress-tested at PRD-target scale (hundreds of pages, tens of MB per
  file) or under concurrent execution — treat the 100MB guard as the hard
  limit, not as a guarantee that anything under it runs comfortably on a
  memory-constrained task runner.
- **The event-loop-yield tradeoff, in plain words.** `pdf-lib` briefly pauses
  ("yields") during large parse/save operations so it doesn't hog the whole
  Node process while working through a big PDF. The way it normally does
  that pause (`setTimeout`) is one of the exact JavaScript features n8n
  Cloud's automated code scanner refuses to allow in a community node, so
  this package swaps in a different pause mechanism (`queueMicrotask`) that
  the scanner does allow. The practical difference: the original mechanism
  would let *other* pending work on the same Node process (timers, incoming
  HTTP requests, etc.) go first during that pause; the substitute does not
  — it only guarantees the current operation doesn't freeze the process
  solid. For a single PDF operation running by itself, you won't notice a
  difference. If this node is doing heavy PDF work on the same Node process
  that's also, say, serving other webhook requests at the same moment, those
  other requests could see slightly more delay than they otherwise would.
  This has not been measured under real concurrent load — see
  `spike/FINDINGS.md` "Q2" for the full technical write-up and
  `scripts/shims/yield.js` for where it's implemented.

## Credentials

None required. Every Tier 1 operation runs locally against binary data already
inside your workflow — there is no third-party service to authenticate with.

## Compatibility

Targets `n8nNodesApiVersion: 1`. No specific minimum n8n version is pinned yet
(the node has no execution-time dependency on any particular n8n feature
release beyond standard binary-data helpers).

## Usage

Drop a **PDF Toolkit** node after any node that outputs binary data (e.g.
"Read/Write Files from Disk", an HTTP Request downloading a PDF, or a
previous PDF Toolkit operation), pick a **Resource** and **Operation**, and
point **Binary Property** at the binary field that holds the PDF (defaults to
`data`, matching most binary-producing core nodes).

If you expect to be new to n8n, see the
[Try it out](https://docs.n8n.io/try-it-out/) documentation to get started
with workflows generally.

## Status: partial implementation

**The entire Document resource (Merge, Split, Extract Pages, Rotate, Reorder,
Delete Pages), the entire Form resource (Read Fields, Fill Form), the entire
Stamp resource (Text Watermark, Image Watermark, Page Numbers, Overlay PDF),
the entire Generate resource (From Template, From Markdown, From Images),
and Extract → Metadata, Embedded Images (JPEG only — see above), and Page
Count are implemented for real**, backed by `pdf-lib` (Generate's From
Template/From Markdown use a small pdf-lib-based layout engine in place of
`pdfmake` — see the Generate section above), and covered by tests in
`tests/` (run with `npm run build && node tests/run-all.mjs`). Only Extract
→ Text and the entire Secure resource (Encrypt, Decrypt, Set Permissions)
remain stubs: each throws a `NodeOperationError` naming the operation and
the reason it's unavailable (not a raw library stack trace, and not just
"not implemented yet") instead of doing real PDF work. The node UI
(resources, operations, parameters) and `execute()` routing are complete and
stable for all six resources.

Unlike the rest of this package, these two remaining stubs are **not**
withheld pending PRD open question O1 (the bundling-eligibility question
that gated everything before Group 1's spike) — that question is resolved
for every library this package actually uses. They're withheld because a
genuine bundling attempt for their required engine hit a hard architectural
wall, documented in `spike/FINDINGS.md`:

- **Secure (Encrypt, Decrypt, Set Permissions)** → needs a WASM engine
  (qpdf, since `pdf-lib` has no encryption support at all); the evaluated
  qpdf-wasm builds can't yet be bundled scanner-clean for this package — see
  "Q6 — qpdf-wasm eval".
- **Extract → Text** → intended to be `pdfjs-dist`, but a genuine bundling
  attempt found it architecturally incompatible with this package's
  no-filesystem/no-unbundled-dynamic-import/scanner-clean constraints — see
  "Q4 — pdfjs-dist bundling". The stub remains until a viable engine is
  found.

**Note on n8n Cloud verification eligibility:** `pdf-lib` is bundled into
`dist/` at build time (esbuild), so the published package declares zero
runtime dependencies, and the built artifact passes the community-node
scanner's own local static-analysis check (`analyzePackage()`) with 0
errors. That is **not** the same as "verified for n8n Cloud" — the
published-package scanner CLI (a post-publish, registry-lookup-based gate),
human review, and PRD open question O1 (utility-node eligibility) are all
still open. See `spike/FINDINGS.md` (Q2) for the full, honest writeup,
including a documented event-loop-yielding tradeoff introduced by the
bundling shim (`scripts/shims/yield.js`).

## Migrating from n8n-nodes-pdfkit

If you're coming from `n8n-nodes-pdfkit` (images → PDF only, last published
2023-05-14), the **Generate → From Images** operation is the drop-in parity
op — implemented for real: point it at the same image binaries you were
feeding into `n8n-nodes-pdfkit`, and it produces the same one-image-per-page
PDF. This package also covers merge/split/watermark/forms/extraction (all
implemented for real, see [Status: partial implementation](#status-partial-implementation)),
none of which `n8n-nodes-pdfkit` ever supported — only encryption/permissions
(Secure) and Extract → Text are still pending.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [PDF Toolkit PRD](https://github.com/krystianslowik/n8n-nodes-pdf) — product requirements, open questions, and roadmap (Tier 1 / Tier 2 split, O1–O5)

## Version history

- **0.2.0** — 18 of 22 operations implemented for real against the bundled
  `pdf-lib` (all of Document, Generate, Form, Stamp; Extract's Metadata/
  Embedded Images/Page Count), covered by 89 tests driving the actual built
  `dist/` artifact. The remaining 4 (Extract → Text, Secure → Encrypt/
  Decrypt/Set Permissions) are honest, investigated stubs — see
  [Not yet supported](#not-yet-supported). Zero runtime dependencies
  throughout; `npm run lint` is green under the full n8n Cloud config. See
  `CHANGELOG.md` and `VERIFICATION.md` for the full detail.
- **0.1.0** — Initial scaffold: full node UI (6 resources, 22 operations) and
  `execute()` routing; all operation bodies are stubs pending PRD open
  question O1.
