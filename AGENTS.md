# n8n community node — PDF Toolkit (n8n-nodes-pdf)

## Overview
This is a project containing code for an n8n community node. n8n is a workflow
automation platform where users build workflows with nodes, which are the
building block of a workflow. Nodes can perform a range of actions, such as
starting a workflow (called a "trigger node"), fetching and sending data, or
processing and manipulating it. Besides that there are credentials - entities
that store sensitive information on how to connect to external services and
APIs. A node can require some credentials to be used. Community nodes are a way
for anyone to create such nodes and add them to be used in n8n. All community
nodes are named in a format: `n8n-nodes-<name>` or `@org/n8n-nodes-<name>`.
Community nodes can also be submitted for approval to be used on n8n Cloud
version. In that case there are rules that the node needs to follow in order to
be approved.

This specific package, `n8n-nodes-pdf` ("PDF Toolkit"), is a **zero-external-
service utility node**: every operation runs in-process (currently pdf-lib;
pdfmake and pdfjs-dist were evaluated but could not be bundled scanner-clean,
see below) and never calls a third-party API.

## Important notes
- Follow the **rules and guidelines in this document and the linked docs
  below** over any code examples.
- All code blocks in these docs are **illustrative and incomplete**.
  They **MUST NOT** be copied verbatim or assumed to be the final desired code.
- 18 of 22 Tier-1 operations are **real** (pdf-lib, esbuild-bundled as a
  devDependency into `dist/` by `scripts/esbuild-bundle.mjs`, which also
  injects `scripts/shims/yield.js` to keep pdf-lib's internal `setTimeout`
  call scanner-legal). Four remain unavailable stubs with a one-line reason
  each: Extract > Text needs pdfjs-dist, whose Node.js support model relies
  on banned globals and a `process` environment check; the Secure resource
  (Encrypt, Decrypt, Set Permissions) needs a qpdf/WASM engine, and the
  available qpdf-wasm builds reference banned Node globals (`process`,
  `__dirname`) and require `fs`/`path` at runtime. Never add a runtime
  `dependencies` entry — new libraries go in `devDependencies` and get
  bundled via `scripts/esbuild-bundle.mjs`; the scanner check
  (`npm run scan`, which runs `scripts/scan-check.mjs`) must stay at 0
  errors.
- Never output generic `Wordpress`/`Example`-style filler — everything here
  is PDF-domain (Document/Generate/Form/Stamp/Extract/Secure resources).

## Project structure
There are two main folders in this project:
- `nodes` contains all of the nodes in a package (there is one: `PdfToolkit`).
  The code for each node usually lives in its own folder.
- `credentials` is intentionally absent — v1 has zero credentials (all Tier 1
  operations are local/in-process).

```
.
├── nodes/
│   └── PdfToolkit/
│       ├── PdfToolkit.node.ts
│       ├── PdfToolkit.node.json
│       ├── pdfToolkit.svg
│       ├── shared/            # common property builders + stub-error helper
│       └── resources/
│           ├── document/      # Merge, Split, Extract Pages, Rotate, Reorder, Delete Pages
│           ├── generate/      # From Template, From Markdown, From Images
│           ├── form/          # Read Fields, Fill Form
│           ├── stamp/         # Text/Image Watermark, Page Numbers, Overlay PDF
│           ├── extract/       # Text, Metadata, Embedded Images, Page Count
│           └── secure/        # Encrypt, Decrypt, Set Permissions
├── scripts/
│   ├── esbuild-bundle.mjs # bundles pdf-lib into dist/ post-build (see above)
│   ├── scan-check.mjs     # local stand-in for the scanner CLI, run via `npm run scan`
│   └── shims/
│       └── yield.js       # esbuild `inject` shim, see esbuild-bundle.mjs
├── package.json
└── ...
```

It's important to note that `package.json` has a special field `n8n` that has
information about nodes and credentials in a package:
```json
{
  "name": "n8n-nodes-pdf",
  "version": "0.1.0",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "strict": true,
    "credentials": [],
    "nodes": [
      "dist/nodes/PdfToolkit/PdfToolkit.node.js"
    ]
  }
}
```
`nodes` and `credentials` keys contain paths to transpiled JS files in a `dist`
folder for the nodes and credentials respectively. If you add/remove/rename
nodes and/or credentials, you need to make sure to update `n8n.nodes` and
`n8n.credentials` keys in `package.json` accordingly.

## Key guidelines
- Use the `n8n-node` CLI tool **whenever possible** for building, dev mode,
  linting, etc.
- **Always** address any lint/typecheck errors/warnings, unless there is a
  **very specific reason** to ignore/disable it.
- Make sure to use **proper types whenever possible**.
- If you are updating the npm package version, make sure to **update
  CHANGELOG.md** in the root of the repository.
- Read `.agents/workflow.md` for more info.

## Context-specific docs
Load these before working on the relevant area:

| Working on...                        | Read first                                                          |
|--------------------------------------|---------------------------------------------------------------------|
| Any node file in `nodes/`            | `.agents/nodes.md` and `.agents/properties.md`                      |
| A declarative-style node             | above + `.agents/nodes-declarative.md`                              |
| A programmatic-style node            | above + `.agents/nodes-programmatic.md`                             |
| Files in `credentials/`              | `.agents/credentials.md`                                            |
| Adding a new version to a node       | `.agents/versioning.md`                                             |
| Starting a new task or planning      | `.agents/workflow.md`                                               |

## Additional resources
- https://docs.n8n.io/integrations/community-nodes/build-community-nodes/
- https://docs.n8n.io/integrations/creating-nodes/overview/
- https://docs.n8n.io/integrations/creating-nodes/build/reference/
- https://docs.n8n.io/integrations/creating-nodes/build/reference/ux-guidelines/
