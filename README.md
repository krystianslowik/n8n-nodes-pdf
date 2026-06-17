# n8n-nodes-pdf (PDF Toolkit)

This is an n8n community node. It lets you run common PDF operations —
merge, split, generate, fill forms, watermark, extract, and secure — **entirely
in-process on your own n8n instance**. There is no external API, no per-document
fee, and no data ever leaves your machine.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Status: partial implementation](#status-partial-implementation)
[Migrating from n8n-nodes-pdfkit](#migrating-from-n8n-nodes-pdfkit)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

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
| From Template | Generate a PDF from a declarative JSON template (text/table/image/list blocks) |
| From Markdown | Generate a PDF from Markdown (headings, lists, tables, code) |
| From Images | Combine one image per incoming item (in input order) into a single multi-page PDF — **drop-in `n8n-nodes-pdfkit` replacement** |

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
| Embedded Images | Extract images embedded in the PDF |
| Page Count | Get the number of pages in the PDF |

**Note:** Embedded Images is the one operation that deviates from the
"Output Binary Property + Output File Name" pair above — it can emit any
number of images per PDF, so it instead takes an **Output Binary Property
Prefix** (default `image`) and writes each extracted image to its own binary
field (`image0`, `image1`, ...) on the output item.

### Secure

| Operation | Description |
|---|---|
| Encrypt | Password-protect a PDF |
| Decrypt | Remove password protection from a PDF |
| Set Permissions | Restrict printing, copying, editing, and other actions |

**Roadmap note (Tier 1 vs. Tier 2):** everything above is **Tier 1** — pure-JS,
verification-safe operations that ship in the core package. **Tier 2**
(HTML → PDF via a bring-your-own-browser CDP endpoint, and OCR/searchable-PDF
via `tesseract.js`) is explicitly **out of scope for this package** and is
being evaluated as a separate, self-hosted-first companion package so it
doesn't jeopardize this package's verification eligibility. See the PRD's
"Operations — Tier 2" section for details.

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

**The entire Document resource (Merge, Split, Extract Pages, Rotate,
Reorder, Delete Pages) and Extract → Page Count are implemented for real**,
backed by `pdf-lib`, and covered by tests in `tests/` (run with `npm run
build && node tests/run-all.mjs`). Every other operation body (Generate,
Form, Stamp, the rest of Extract, Secure) is still a stub: each one throws a
`NodeOperationError` naming the operation (e.g. `The "Fill Form" operation is
not implemented yet`) instead of doing real PDF work. The node UI (resources,
operations, parameters) and `execute()` routing are complete and stable for
all six resources; the remaining PDF logic is withheld pending the
library-bundling decision in the PRD's **open question O1** — whether
zero-external-service "utility" nodes like this one are eligible for n8n's
community-node verification program.

Each remaining stub file under `nodes/PdfToolkit/resources/**` carries a
`TODO` comment naming the library that operation will use once O1 is
resolved:

- **Form**, **Stamp**, **Secure** → `pdf-lib`
- **Generate** → `pdfmake`
- **Extract** (Text, Metadata, Embedded Images) → `pdfjs-dist`

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
op: point it at the same image binaries you were feeding into
`n8n-nodes-pdfkit`, and it produces the same one-image-per-page PDF. Once this
package's operations are implemented (see [Status: partial implementation](#status-partial-implementation)),
you'll be able to uninstall `n8n-nodes-pdfkit` entirely — this package also
covers merge/split/watermark/forms/extraction/encryption, none of which
`n8n-nodes-pdfkit` ever supported.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [PDF Toolkit PRD](https://github.com/krystianslowik/n8n-nodes-pdf) — product requirements, open questions, and roadmap (Tier 1 / Tier 2 split, O1–O5)

## Version history

- **0.1.0** — Initial scaffold: full node UI (6 resources, 22 operations) and
  `execute()` routing; all operation bodies are stubs pending PRD open
  question O1.
