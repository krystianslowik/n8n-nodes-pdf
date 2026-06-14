// SPIKE FINDING (branch spike/esbuild-bundling, PRD open question O1): the
// default `config` enforces `@n8n/community-nodes/no-restricted-imports`,
// which is a *source-level* (AST) check against a hardcoded allowlist
// (n8n-workflow, lodash, moment, p-limit, luxon, zod, crypto). It flags any
// `import`/`require` of a third-party package such as `pdf-lib` in the
// TypeScript source, REGARDLESS of whether the built dist is esbuild-bundled
// down to zero npm "dependencies". Bundling therefore does not satisfy this
// rule as written today — using it requires explicitly opting out of cloud
// support (this is the exact change `npx n8n-node cloud-support disable`
// makes). See spike/FINDINGS.md Q1/Q2 for the full analysis.
import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default configWithoutCloudSupport;
