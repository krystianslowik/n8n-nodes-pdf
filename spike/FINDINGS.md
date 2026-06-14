# Spike findings — esbuild bundling for `n8n-nodes-pdf` (Milestone 1 / PRD §10, §7 O1)

Branch: `spike/esbuild-bundling`. This spike answers PRD open question O1
("confirm scanner accepts bundling — shared open question with the
observability PRD") and the three questions in the spike brief.

**Headline result: bundling technically works (Q1 = yes at the npm-dependency
level), but n8n's actual community-node static-analysis tooling does not treat
"bundled" the same as "no dependency" — it statically inspects source/compiled
JS for third-party `import`/`require` calls and for a few globals (`setTimeout`,
`console`), and pdf-lib's own internals trip both. The net answer to Q2 is
"not as currently built" — the specific, irreducible blocker is documented
below, and it is a real engineering/library problem, not a tooling
availability problem.**

---

## Q1 — Can heavy PDF libs be bundled so the package keeps ZERO runtime dependencies?

**Answer: Yes, at the level the question is usually asked (npm `dependencies`
field / `npm ls --omit=dev` / actual `require()` graph at runtime).**

- `pdf-lib` and `esbuild` were added as `devDependencies` **only**.
  `package.json` has no `dependencies` key at all (confirmed absent, not just
  empty).
- `npm run build` now runs `n8n-node build && node scripts/esbuild-bundle.mjs`
  (see `scripts/esbuild-bundle.mjs`). The esbuild step:
  - bundles the compiled entry point `dist/nodes/PdfToolkit/PdfToolkit.node.js`
    with `bundle: true, platform: 'node', target: 'node18', format: 'cjs',
    external: ['n8n-workflow']`, inlining pdf-lib (and every relative
    `./resources/**`, `./shared/**` import) in place.
  - **prunes** the now-orphaned, individually-tsc-compiled
    `dist/nodes/PdfToolkit/resources/**` and `dist/nodes/PdfToolkit/shared/**`
    JS files. These are dead weight after bundling (nothing loads them —
    `package.json`'s `n8n.nodes` only points at the bundled entry file) —
    but critically they still contain a literal, unbundled
    `require('pdf-lib')`, so leaving them in the published tarball would
    silently defeat the whole point of bundling (see Q2 below).
  - adds `drop: ['console']` to strip `console.*` calls that ship inside
    pdf-lib's own source (also required for Q2, see below).

**Evidence:**

```
$ npm ls --omit=dev
n8n-nodes-pdf@0.1.0 /Users/.../n8n-nodes-pdf
├── @emnapi/wasi-threads@1.2.1 extraneous
└── n8n-workflow@2.28.4
```
No entries under a `dependencies` tree — the two "extraneous" lines are
leftover node_modules artifacts not declared anywhere, not resolved
dependencies (there is no `dependencies` key to resolve against).

```
$ grep -oE "require\([\"'][^\"']+[\"']\)" dist/nodes/PdfToolkit/PdfToolkit.node.js | sort -u
require("n8n-workflow")
```
The only `require()` left in the bundled entry file is `n8n-workflow`
(external, as intended — n8n's runtime provides it). No `require('pdf-lib')`
anywhere in the bundle.

**Isolation test** (move `node_modules` away, `require()` the built file with
only a hand-written stub `n8n-workflow` on the module path):

```
$ mv node_modules /tmp/.../backup
$ node -e "
    const { PdfToolkit } = require('.../dist/nodes/PdfToolkit/PdfToolkit.node.js');
    const instance = new PdfToolkit();
    console.log('OK — required with only stub n8n-workflow on path. node name:', instance.description.name);
  "
OK — required with only stub n8n-workflow on path. node name: pdfToolkit
$ mv /tmp/.../backup node_modules   # restored
```
Succeeded — the bundled file has zero unresolved module dependencies beyond
`n8n-workflow`.

**Bundle size:** `dist/` totals **1,168 KB (~1.14 MB)**, well under the PRD's
`<10MB` non-functional target. Breakdown: the single bundled
`PdfToolkit.node.js` is ~1.0MB (pdf-lib plus our ~20 stub operation files plus
descriptions/types), the rest is `.d.ts`/icons/`package.json`/tsbuildinfo.

**Verdict: Q1 = YES.** The build produces a self-contained `dist/` that
requires nothing outside `n8n-workflow` at runtime, and the package.json
`dependencies` field stays absent/empty.

---

## Q2 — Does the scanner accept a bundled package?

**Answer: The published `@n8n/scan-community-package` CLI could not be run
against our local, unpublished tarball at all (see "What we tried" below) —
that itself is a spike finding. Going one level deeper and running the exact
same static-analysis check the scanner uses (its `analyzePackage()` function,
called directly against our locally unpacked tarball) shows bundling gets
very close but does NOT fully pass as-is: one violation is irreducible without
patching pdf-lib itself.**

### What we tried (CLI, as instructed)

```
$ npm pack
n8n-nodes-pdf-0.1.0.tgz

$ timeout 300 npx --yes @n8n/scan-community-package@latest ./n8n-nodes-pdf-0.1.0.tgz < /dev/null
Failed to analyze ./n8n-nodes-pdf-0.1.0.tgz@null: AxiosError: Request failed with status code 404
  ...
  config: { ..., url: 'https://registry.npmjs.org//./n8n-nodes-pdf-0.1.0.tgz', ... }
  response: { status: 404, data: { error: 'Not found' } }
❌ Package ./n8n-nodes-pdf-0.1.0.tgz@null has failed security checks
Reason: Analysis failed: Request failed with status code 404
```

Root cause (confirmed by reading the tool's source, downloaded via
`npm pack @n8n/scan-community-package@latest`): its CLI (`scanner/cli.mjs`)
**only accepts `<package-name>[@version]`** and always resolves that name
against the **public npm registry** — `scanner.mjs`'s `analyzePackageByName()`
does `axios.get('https://registry.npmjs.org/' + packageName)` for metadata and
provenance, then `npm pack packageName@version` to fetch the tarball itself.
There is no code path that accepts a local file path or directory. This means
**the real scanner CLI cannot be exercised for an unpublished, local-only
package at all** — it is a post-publish gate, not a pre-publish local check.
This is itself a legitimate Q2 finding: a spike done entirely locally cannot
get a literal "the scanner passed/failed" answer from the CLI without first
publishing to npm (which this spike deliberately did not do).

### Going one level deeper: running the scanner's actual lint check locally

`analyzePackageByName()` is a thin wrapper around `analyzePackage(packageDir)`,
which is pure local static analysis (ESLint with
`@n8n/eslint-plugin-community-nodes`'s `configs.recommended`, run over every
`.js`/`.json` file in the unpacked tarball — no network calls). We installed
`@n8n/scan-community-package` for its dependencies, then imported and called
`analyzePackage()` directly against our own locally unpacked `npm pack` output
(`tar -xzf n8n-nodes-pdf-0.1.0.tgz`) — i.e. we ran the exact same check the
real scanner runs, just skipping the "download from registry" step it can't
do for a local-only package.

**First run (before pruning orphaned per-file JS / before `drop: ['console']`):**

```
{
  "passed": false,
  "message": "ESLint violations found",
  "details": "
/dist/nodes/PdfToolkit/PdfToolkit.node.js
    841:9   error  Use of restricted global 'setTimeout' is not allowed  @n8n/community-nodes/no-restricted-globals
  12663:13  error  Unexpected console statement                          no-console
  15151:15  error  Unexpected console statement                          no-console
  ... (8 no-console hits total)

/dist/nodes/PdfToolkit/resources/document/merge.js
  5:19  error  Require of 'pdf-lib' is not allowed. n8n Cloud does not allow community nodes with dependencies  @n8n/community-nodes/no-restricted-imports

/dist/nodes/PdfToolkit/resources/extract/pageCount.js
  5:19  error  Require of 'pdf-lib' is not allowed. n8n Cloud does not allow community nodes with dependencies  @n8n/community-nodes/no-restricted-imports

✖ 11 problems (11 errors, 0 warnings)"
}
```

Two categories of failure, both important:

1. **`no-restricted-imports` on the *non-bundled* per-file compiled JS.**
   `n8n-node build`'s `tsc` step compiles every `.ts` file individually into
   `dist/nodes/PdfToolkit/resources/**/*.js` and `shared/**/*.js`. esbuild
   only bundled the single entry point (`PdfToolkit.node.js`); those other
   compiled files were still sitting in `dist/`, unbundled, each with a
   literal `require('pdf-lib')`. **The scanner lints every `.js` file in the
   published tarball, not just the entry point** — so bundling only the entry
   file is not sufficient; anything else shipped in `dist/` that still
   contains an unbundled third-party `require()` will fail. We fixed this by
   having the build script delete those now-orphaned files (nothing loads
   them at runtime post-bundling anyway).

2. **`no-console` and `no-restricted-globals` on the *bundled* entry file
   itself, caused by pdf-lib's own internals.** Once bundled, pdf-lib's source
   is textually indistinguishable from "our" code to static analysis:
   - `no-console`: pdf-lib emits a handful of `console.warn`/`console.log`
     calls in its own validation/recovery paths. Fixed with esbuild's
     `drop: ['console']` (strips these call expressions from the bundle
     entirely — safe here since they're diagnostic, not control-flow).
   - `no-restricted-globals` (`setTimeout`): **this one is not fixable by
     bundling configuration.** It comes from pdf-lib's own
     `cjs/utils/async.js`:
     ```js
     exports2.waitForTick = function() {
       return new Promise(function(resolve) {
         setTimeout(function() { return resolve(); }, 0);
       });
     };
     ```
     `waitForTick()` is called from inside pdf-lib's **core PDF
     parser/writer loops** (`PDFParser.js`, `PDFObjectStreamParser.js`,
     `PDFWriter.js`, `PDFStreamWriter.js`) — i.e. it runs on essentially every
     `PDFDocument.load()`/`.save()` call, not an edge case we could route
     around. It exists specifically so pdf-lib **yields the event loop**
     during CPU-heavy parse/write work on large documents — which is
     *exactly* the behavior the PRD asks for under R2 ("operations are
     CPU-bound and must yield (no event-loop starvation on task runners)").
     So there is a direct conflict: the behavior the PRD wants is implemented
     by pdf-lib via the exact global n8n's Cloud static analysis disallows.
     ESLint's check is a pure AST token match — it flags the mere presence of
     `setTimeout` in the file regardless of whether that code path executes,
     so this cannot be dodged by, e.g., only calling operations that
     "shouldn't" hit it.

### After fixes (pruning orphaned files + `drop: ['console']`)

```
$ npm pack && tar -xzf n8n-nodes-pdf-0.1.0.tgz -C /tmp/unpacked --strip-components=1
$ node drive-analyze.mjs /tmp/unpacked   # calls analyzePackage() directly
{
  "passed": false,
  "message": "ESLint violations found",
  "details": "
/dist/nodes/PdfToolkit/PdfToolkit.node.js
  841:9  error  Use of restricted global 'setTimeout' is not allowed  @n8n/community-nodes/no-restricted-globals

✖ 1 problem (1 error, 0 warnings)"
}
```

Down from 11 violations across 3 files to exactly **1 irreducible violation**,
precisely isolated to pdf-lib's internal `waitForTick()`. Every fixable issue
(orphaned unbundled files, third-party console noise) is fixed; what remains
is a genuine library/policy conflict, not a packaging mistake.

### A related, separate finding: the local `n8n-node lint` also blocks this

Independent of the published-package scanner, `n8n-node lint`'s own default
config enforces the identical `@n8n/community-nodes/no-restricted-imports`
rule against the **TypeScript source** (not just the compiled/bundled
output) — it flagged `import { PDFDocument } from 'pdf-lib'` in `merge.ts`
and `pageCount.ts` immediately, regardless of any downstream bundling
strategy, because it's a source-level AST check against a hardcoded allowlist
(`n8n-workflow`, `lodash`, `moment`, `p-limit`, `luxon`, `zod`, `crypto`,
`ai-node-sdk`) — pdf-lib is not on it and there is no bundling-aware escape
hatch. The only way to keep `npm run lint` green (a spike requirement) was the
tool's own documented opt-out: `npx n8n-node cloud-support disable`, which
switches `eslint.config.mjs` to `configWithoutCloudSupport` and sets
`package.json`'s `n8n.strict` to `false`. Its own confirmation prompt says
this explicitly: **"This will make your node ineligible for n8n Cloud
verification!"** / **"Cloud support disabled. Your node may pass linting but
it won't pass verification for n8n Cloud."** We made this exact change by hand
(the CLI's confirmation prompt can't be driven non-interactively under the
anti-hang stdin-from-`/dev/null` rule) — see `eslint.config.mjs`'s comment and
`package.json`'s `n8n.strict: false`.

### Verdict

**Q2 = No, not with the current tooling and pdf-lib as-is**, for a precise,
narrow reason: `pdf-lib`'s own internal `setTimeout`-based event-loop-yield
utility (used in every parse/save call) trips
`@n8n/community-nodes/no-restricted-globals`, which is applied identically to
bundled and unbundled code because it's a source-text AST check, not a
dependency-graph check. Bundling *does* solve the "dependencies" and
`no-restricted-imports` half of the problem (11 → 1 violations after fixing
packaging), but does not make the resulting artifact fully scanner-clean. To
close this gap for real, the choices are: (a) get n8n to special-case
lint-clean bundled output or allowlist this specific pattern, (b) patch/fork
pdf-lib to remove `setTimeout` usage before bundling (fragile, and arguably
undermines the "no obfuscation" spirit of the review), or (c) accept
cloud-ineligibility for a self-hosted-only release track (matches PRD
Milestone "W3–5 — v0.1 (self-hosted beta): publish unverified"). This directly
informs O1: the blocker is not really "are zero-service utility nodes
eligible" — it is "does *any* bundled third-party PDF library survive today's
scanner," and the answer, for pdf-lib specifically, is not yet.

We could not obtain a literal pass/fail transcript from the published CLI
itself (it requires a real, published npm package — see above), so this
verdict is built from running the scanner's actual lint logic directly, which
is the most complete evidence obtainable without publishing.

---

## Q3 — Do real operations work in-process?

**Answer: Yes.** Implemented for real (all other 20 operations remain stubs,
unchanged):

- **Document > Merge** (`nodes/PdfToolkit/resources/document/merge.ts`):
  many-to-one operation. Resolves an ordered list of `(itemIndex,
  binaryPropertyName)` sources — either one binary field read across every
  incoming item (`mergeFrom: allItems`, the default) or a comma-separated,
  ordered list of binary field names scanned across all items
  (`mergeFrom: binaryProperties`) — validates each with
  `this.helpers.assertBinaryData`, loads each with
  `this.helpers.getBinaryDataBuffer` + `PDFDocument.load`, and combines them
  with `mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())` +
  `mergedPdf.addPage(page)` per copied page, preserving item order. Output
  goes through `this.helpers.prepareBinaryData`, respecting the existing
  `Output Binary Property` / `Output File Name` params from `outputOptionsField`.
- **Extract > Page Count** (`nodes/PdfToolkit/resources/extract/pageCount.ts`):
  loads the binary via `this.helpers.getBinaryDataBuffer` +
  `PDFDocument.load`, returns `{ json: { pageCount: pdf.getPageCount() } }`
  per item (binary presence already validated by the generic itemwise
  pre-check in `PdfToolkit.node.ts`).

### Harness (`spike/harness.mjs`)

Standalone script (no test runner, no n8n launch) that:
1. Generates two small PDFs (2 and 3 pages) and one 100-page PDF, all with the
   bundled `pdf-lib` itself (`PDFDocument.create()` + `addPage()` +
   `drawText()` with an embedded Helvetica font).
2. Requires the actual **bundled dist artifact**
   (`dist/nodes/PdfToolkit/PdfToolkit.node.js` — the exact esbuild output from
   Q1, not the TS source), so this harness exercises the real, shippable build.
3. Drives `PdfToolkit.prototype.execute` with a minimal hand-rolled
   `IExecuteFunctions` mock implementing only `getInputData`,
   `getNodeParameter`, `getNode`, `continueOnFail`, and
   `helpers.{assertBinaryData, getBinaryDataBuffer, prepareBinaryData}`.
4. Runs three assertions with `node:assert/strict` and samples
   `process.memoryUsage().rss` every 5ms during each call to report a real
   peak, not just a before/after snapshot.

**Run:**

```
$ timeout 300 node spike/harness.mjs < /dev/null
[harness] Generating test PDFs...
[harness] Generated: Doc A (2p, 1079B), Doc B (3p, 1291B), Doc 100 (100p, 22184B)

[harness] Test 1: Document > Merge (2 small PDFs)
[harness] merge(2 small PDFs): 6ms, RSS before=137.0MB after=137.6MB peak=137.6MB
[harness] Test 1 PASSED: 1 output item, 5 pages (2 + 3), page count matches json.pageCount

[harness] Test 2: Document > Merge (2-page doc + 100-page doc)
[harness] merge(2p + 100p): 17ms, RSS before=137.8MB after=140.8MB peak=140.8MB
[harness] Test 2 PASSED: 1 output item, 102 pages (2 + 100). Peak RSS during merge: 140.8MB

[harness] Test 3: Extract > Page Count
[harness] pageCount(3 items): 5ms, RSS before=141.2MB after=141.4MB peak=141.4MB
[harness] Test 3 PASSED: page counts [2, 3, 100] all correct

[harness] ALL TESTS PASSED
```

**Verdict: Q3 = YES.** Merge of 2 PDFs produces exactly 1 output item with the
correct summed page count (5 = 2 + 3); merging a 100-page document completes
in ~17ms with peak RSS ~140.8MB (this is the Node process's baseline RSS —
dominated by V8/Node/pdf-lib module load, not the PDF data itself, which is
only ~22KB for the 100-page doc); Page Count returns correct per-item results
for all three documents. No PRD R2 memory blowup observed at this scale — a
real stress test (e.g. 50MB/many-hundred-page inputs on a memory-constrained
task runner) is out of scope for this spike but flagged as a follow-up before
v0.1 ships Merge for real.

---

## Other notes / process deviations

- `npm run lint` is green, but only after switching `eslint.config.mjs` to
  `configWithoutCloudSupport` and `package.json`'s `n8n.strict` to `false`
  (see Q2). This is a deliberate, documented, reversible change scoped to
  this spike branch — reverting it (`npx n8n-node cloud-support enable`, or
  hand-reverting the two files) immediately reproduces the original 2
  `no-restricted-imports` errors, confirming the tooling's own default
  posture is "reject pdf-lib," bundled or not.
- All 20 other operations across Document/Generate/Form/Stamp/Extract/Secure
  remain untouched stubs (`throwNotImplemented`), per the task scope.
- `spike/harness.mjs` requires `npm run build` to have already produced
  `dist/` (it loads the actual bundled artifact, not the TS source) — this is
  intentional so the harness proves Q1 and Q3 against the same artifact.
