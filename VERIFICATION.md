# VERIFICATION.md — submission dossier for `n8n-nodes-pdf` (PDF Toolkit)

This is the honest, current-state writeup for whoever on n8n's verification
team reviews this package. It says plainly what has been checked, what has
not, and what is still open. Nothing here should be read as "this package is
verified" — see [Open questions for the verification team](#open-questions-for-the-verification-team)
for exactly where the remaining uncertainty lives. The detailed engineering
record behind every claim below is `spike/FINDINGS.md`; this document is the
summary a reviewer can read without wading through that spike log.

## What passes, with evidence

All four commands below were run against this exact commit, from a clean
working tree, immediately before this dossier was written.

**Build** — `timeout 300 npm run build < /dev/null`

```
exit 0
dist/nodes/PdfToolkit/PdfToolkit.node.js  1.1mb
[esbuild-bundle] bundled pdf-lib into dist/nodes/PdfToolkit/PdfToolkit.node.js
[esbuild-bundle] pruned orphaned per-file compiled output (resources/, shared/)
```

**Lint** — `timeout 300 npm run lint < /dev/null`, full n8n Cloud config

```
exit 0
```

`eslint.config.mjs` is `@n8n/node-cli/eslint`'s `config` — byte-identical to
the CLI's own default template, i.e. cloud support is **not** disabled — and
`package.json`'s `n8n.strict` is `true`. Neither has ever been relaxed to get
a green run; see [The 1 suppression](#the-1-suppression-and-its-justification)
below for the only exception, which is line-scoped, not config-level.

**Scanner static analysis** — `timeout 300 node spike/drive-analyze.mjs < /dev/null`

```
[drive-analyze] npm pack...
[drive-analyze] packed n8n-nodes-pdf-0.2.0.tgz (293167 bytes)
[drive-analyze] running the scanner's analyzePackage() against the unpacked tarball...
{ "passed": true }
[drive-analyze] PASSED — 0 ESLint violations in the packed tarball.
```

This calls `@n8n/scan-community-package`'s own `analyzePackage()` — the exact
ESLint pass (`@n8n/eslint-plugin-community-nodes`'s `configs.recommended`)
the real scanner runs — directly against this package's own `npm pack`
output. **This is not the same thing as the published-package scanner CLI
having run against this package** (that CLI requires a real npm-registry
lookup of an already-published version and has no local/pre-publish code
path — confirmed by reading its source; see `spike/FINDINGS.md` Q2, "What we
tried"). It is the one gate in the pipeline this dossier can exercise
pre-publish, and it is clean.

**Zero runtime dependencies** — `npm ls --omit=dev`

```
n8n-nodes-pdf@0.2.0
├── @emnapi/wasi-threads@1.2.2 extraneous
└── n8n-workflow@2.28.4
```

No `dependencies` key exists in `package.json` at all. `pdf-lib`, `esbuild`,
and every other library this package uses at build time are `devDependencies`
only, bundled into `dist/` by `scripts/esbuild-bundle.mjs`. Grepping the
bundled entry file for `require(...)` calls turns up exactly one:
`require("n8n-workflow")` (external by design — n8n's runtime provides it).

**Test suite** — `timeout 300 node tests/run-all.mjs < /dev/null` (after
`npm run build`, since tests drive the real built artifact, not TS source)

```
[run-all] 89 passed, 0 failed, out of 22 test file(s)
```

Every real (non-stub) operation has at least one test in `tests/ops/`, each
driving the actual bundled `dist/nodes/PdfToolkit/PdfToolkit.node.js` through
a shared mocked `IExecuteFunctions` (`tests/mock-execute.mjs`) — not the TS
source, and not a hand-simulated execute path. Assertions check real
semantics (page counts, field values, content-stream growth, metadata
values), not just "did not throw." The 4 stub operations each have a test
asserting their error message names the specific blocker (`tests/ops/
text.test.mjs`, `tests/ops/secure.test.mjs`).

## The 1 suppression, and its justification

```
nodes/PdfToolkit/shared/pdf.ts:19:
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
```

This is the only `eslint-disable` anywhere under `nodes/`, `scripts/`, or
`tests/` (grepped and counted at the time of writing). It sits directly above
the single `import { PDFDocument, ... } from 'pdf-lib'` statement that every
other operation file in this package imports pdf-lib's symbols through
(a relative import of `shared/pdf.ts`, which `no-restricted-imports` always
allows). `no-restricted-imports` is a source-level AST check with no
bundling-aware carve-out — it fires on this line regardless of the fact that
esbuild bundles `pdf-lib` away at build time and the compiled `dist/` file it
actually ships contains no unbundled `pdf-lib` import (confirmed by the
scanner run above, which lints the compiled output, not the TypeScript
source). The suppression is scoped to exactly this one import line, not the
rule, the file, or the project; the justification comment directly above it
in `shared/pdf.ts` explains why in more detail. (An earlier point in this
package's history had this same suppression duplicated across two files,
`merge.ts` and `pageCount.ts`, before their pdf-lib import was centralized
into this one shared module — the count has gone down, not up, as more
operations were implemented.)

## Deferred operations, and why

4 of 22 Tier-1 operations remain stubs. Each was genuinely investigated
against the specific library the PRD proposed for it, not simply skipped,
and each error message names the real blocker instead of saying only "not
implemented yet":

- **Extract → Text** — blocked on `pdfjs-dist`. Its Node-environment
  detection (`isNodeJS`) depends on the banned `process` global with no
  legitimate, non-obfuscating substitute (unlike `setTimeout`, see below,
  this isn't a case where a different value under the same name serves the
  same purpose); its worker architecture needs either a runtime dynamic
  `import()` of a file path on disk (violates "no unbundled dynamic
  imports" and "no filesystem access at runtime" simultaneously) or
  reimplementing pdf.js's undocumented internal message-handler wire
  protocol; and its banned-globals surface (`setTimeout`: 13, `clearTimeout`:
  16, `process`: 7, `globalThis`: 16, mostly dead web-viewer UI code that
  can't be tree-shaken because pdfjs-dist ships pre-webpacked, not
  tree-shakeable source) is an order of magnitude larger than pdf-lib's one
  fixable violation. Full writeup: `spike/FINDINGS.md` "Q4 — pdfjs-dist
  bundling". Error tested in `tests/ops/text.test.mjs`, thrown via
  `throwEngineUnavailable` (`nodes/PdfToolkit/shared/notImplemented.ts`).
- **Secure → Encrypt** — blocked on `qpdf-wasm`. `pdf-lib` has no PDF
  standard-security-handler implementation at all, so encryption needs a
  different engine. Both viable npm builds evaluated
  (`@jspawn/qpdf-wasm@0.0.2`, `@neslinesli93/qpdf-wasm@0.3.0`) ship an
  Emscripten Node bootstrap that unconditionally references the banned
  `process`/`__dirname` globals and `require()`s the banned built-ins `fs`/
  `path` — entangled through Node-vs-browser detection and `uncaughtException`/
  `unhandledRejection` wiring, not one isolated, cleanly-substitutable call
  site the way pdf-lib's single `setTimeout` was. One piece (the WASM-bytes
  file load) IS legitimately fixable via Emscripten's own `instantiateWasm`
  option, but that doesn't reach the `require('fs')`/`require('path')` calls,
  which sit in dead code paths that would still need deleting from a vendored
  copy of generated glue code to stop shipping — a maintenance liability
  judged disqualifying on its own. Full writeup: `spike/FINDINGS.md` "Q6 —
  qpdf-wasm eval". Error tested in `tests/ops/secure.test.mjs`.
- **Secure → Decrypt** — same `qpdf-wasm` blocker as Encrypt (Q6).
- **Secure → Set Permissions** — same `qpdf-wasm` blocker as Encrypt (Q6).

Viable future paths for the Secure blocker, in rough order of promise (from
`spike/FINDINGS.md` Q6): a self-hosted-first companion package (mirroring the
PRD's own O3 pattern for HTML→PDF), a from-source Emscripten rebuild against
a custom (non-CLI) `main()` entry point, or a from-scratch pure-JS PDF
standard-security-handler implementation against `pdf-lib` + Node's
already-allowlisted `node:crypto`.

## What's implemented for real (18/22)

All of **Document** (Merge, Split, Extract Pages, Rotate, Reorder, Delete
Pages), **Generate** (From Template, From Markdown, From Images — via a
purpose-built pdf-lib layout engine, `docRenderer.ts`, after `pdfmake` was
evaluated and rejected as a hard filesystem-access blocker, see
`spike/FINDINGS.md` Q5), **Form** (Read Fields, Fill Form), **Stamp** (Text
Watermark, Image Watermark, Page Numbers, Overlay PDF), and **Extract** →
Metadata, Embedded Images (JPEG/`DCTDecode` only, documented boundary),
Page Count — all backed by `pdf-lib`, all with tests driving the real built
artifact. See `README.md`'s Operations section for the per-op parameter/
output documentation, and `CHANGELOG.md`'s 0.2.0 entry for the full list of
what changed since the 0.1.0 scaffold.

## Known documented tradeoff: the `queueMicrotask` yield shim

`pdf-lib`'s own `waitForTick()` (called on every `PDFDocument.load()`/
`.save()`) yields the event loop via `setTimeout(fn, 0)` — banned outright by
`@n8n/community-nodes/no-restricted-globals`, and so is `setImmediate` (the
otherwise-obvious substitute), so there is no scanner-legal primitive left
that yields to the timer/IO phase the way the original code did.
`scripts/shims/yield.js` redirects `setTimeout` (as resolved inside the
bundled `pdf-lib` code, via esbuild's `inject`) to `queueMicrotask` instead —
a real change to what the identifier binds to at runtime (verified: the
built bundle contains a local `function setTimeout(fn) { queueMicrotask(fn);
}` declaration, and pdf-lib's call site resolves to it), not textual
obfuscation of the same global call. The tradeoff is real and stated plainly
in `README.md`'s Limits section and `scripts/shims/yield.js`'s own comment:
`queueMicrotask` drains before the timer/IO phase, so pending timers/I/O on
the same Node process can be delayed for the duration of a large parse/save
loop in a way `setTimeout`/`setImmediate` would not have delayed them. Not
observed as a problem at the scale tested (`spike/harness.mjs`, up to
100 pages), but that harness does not exercise concurrent I/O against the
same process during a parse/save call, so it can't rule the tradeoff's
real-world effect in or out.

## Open questions for the verification team

These are the people/process questions this dossier cannot answer from code
alone — each is phrased as a direct question, per the PRD's own framing of
these as open questions (O1 et al.) rather than settled facts:

1. **Is a zero-external-service utility node eligible for the verified
   community-nodes program at all?** (PRD O1.) This package integrates no
   third-party API or service — every operation is local, in-process PDF
   manipulation. If the program's eligibility bar requires "integrates
   exactly one third-party service," is a utility node like this
   categorically ineligible, or is there precedent/a path for utility-style
   nodes? This is the single highest-leverage question to get an answer to
   before investing further in this submission.
2. **What does the post-publish scanner CLI (registry lookup + provenance +
   Aikido-adjacent malware scanning) actually report against this package,
   once published?** `analyzePackage()` (this package's own local static
   analysis, reported clean above) is one component of that pipeline; the
   full CLI has never run against this package because it requires an
   already-published npm version and this submission process deliberately
   evaluates pre-publish. Is there a way to get a pre-publish signal from
   that fuller pipeline, or is "publish, then find out" the only path?
3. **Will human review flag a ~1MB bundled third-party library (`pdf-lib`,
   inlined into `PdfToolkit.node.js`) as an "obfuscated code" concern?**
   The internal playbook this package's spike referenced notes only ~30% of
   CLI-scaffolded submissions get one-shot human approval, and a large
   bundled dependency is exactly the kind of artifact a manual "is this
   hand-modified/obfuscated third-party code?" check exists to catch, even
   though nothing here is actually obfuscated (the bundling is standard
   esbuild output, and the one behavioral substitution made — see next
   question — is documented in three places). Is there a preferred way to
   flag "this is bundled, not obfuscated" for a human reviewer up front
   (e.g. a source-map artifact, a note in the PR description) rather than
   relying on them finding `spike/FINDINGS.md`?
4. **Is the `setTimeout` → `queueMicrotask` yield-semantics substitution
   (see above) an acceptable behavioral tradeoff for Cloud verification, or
   does it need a different resolution?** It satisfies `no-restricted-
   globals`'s actual scope-analysis logic (a real local definition, not a
   banned global reference) and is a genuine behavioral substitute for the
   same purpose (yielding during CPU-heavy work), not an evasion — but it is
   also not equivalent to what `setTimeout`/`setImmediate` would have done,
   and a future stricter rule (or a reviewer who disagrees with this
   package's read of "legitimate substitute") could reasonably still flag
   it. Should this package pursue one of the qpdf-wasm-style future paths
   (companion package, from-source rebuild) for `pdf-lib` too, or is this
   substitution considered settled?

## Files most relevant to this dossier

- `spike/FINDINGS.md` — the full engineering record (Q1-Q6) behind every
  claim above.
- `spike/drive-analyze.mjs` — the committed, re-runnable scanner-check repro.
- `spike/harness.mjs` — the committed, re-runnable Merge/Page-Count/memory
  repro from the original spike.
- `tests/run-all.mjs` — the full test suite (89 tests, `npm run build && node
  tests/run-all.mjs`).
- `scripts/shims/yield.js` — the `queueMicrotask` substitution and its full
  tradeoff writeup.
- `nodes/PdfToolkit/shared/notImplemented.ts` — the two stub-error helpers
  (`throwNotImplemented` vs. `throwEngineUnavailable`) and why they're
  distinct.
- `README.md` — end-user-facing documentation, including the
  [Not yet supported](README.md#not-yet-supported) and
  [Limits](README.md#limits) sections this dossier summarizes for a
  technical reviewer.
