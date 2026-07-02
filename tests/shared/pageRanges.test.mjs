/**
 * Unit tests for `nodes/PdfToolkit/shared/pageRanges.ts` (PRD F2). Loaded
 * directly via `tests/util/load-ts.mjs` (esbuild transpile, no full node
 * build required) rather than through the bundled dist artifact, since this
 * module has no pdf-lib dependency to exercise for real.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { dummyNode } from '../mock-execute.mjs';
import { nodesPdfToolkitPath, requireTs } from '../util/load-ts.mjs';

// See mock-execute.mjs's comment: n8n-workflow's ESM build is broken, so use
// require() (the CJS build) instead of a top-level `import`.
const require = createRequire(import.meta.url);
const { NodeOperationError } = require('n8n-workflow');

const { parsePageRangeGroups, parsePageRanges } = requireTs(
	nodesPdfToolkitPath('shared', 'pageRanges.ts'),
);

function assertThrowsNodeOperationError(fn, messageIncludes) {
	assert.throws(
		fn,
		(error) => {
			assert.ok(error instanceof NodeOperationError, 'expected a NodeOperationError');
			if (messageIncludes) {
				assert.ok(
					error.message.includes(messageIncludes),
					`expected error message to include "${messageIncludes}", got: "${error.message}"`,
				);
			}
			return true;
		},
	);
}

export const tests = [
	{
		name: 'parses a simple comma-separated list of single pages',
		fn: () => {
			const groups = parsePageRangeGroups('1,3,5', 10, dummyNode);
			assert.deepEqual(
				groups.map((g) => g.pages),
				[[0], [2], [4]],
			);
			assert.deepEqual(groups.map((g) => g.raw), ['1', '3', '5']);
		},
	},
	{
		name: 'parses a closed range into consecutive 0-indexed pages',
		fn: () => {
			const groups = parsePageRangeGroups('1-3', 10, dummyNode);
			assert.equal(groups.length, 1);
			assert.deepEqual(groups[0].pages, [0, 1, 2]);
		},
	},
	{
		name: 'open-ended range ("9-") runs to the document\'s last page',
		fn: () => {
			const groups = parsePageRangeGroups('9-', 10, dummyNode);
			assert.equal(groups.length, 1);
			assert.deepEqual(groups[0].pages, [8, 9]);
		},
	},
	{
		name: 'open-ended range on a 1-page document selects just that page',
		fn: () => {
			const groups = parsePageRangeGroups('1-', 1, dummyNode);
			assert.deepEqual(groups[0].pages, [0]);
		},
	},
	{
		name: 'mixed expression "1-3,7,9-" produces one group per token, in order',
		fn: () => {
			const groups = parsePageRangeGroups('1-3,7,9-', 10, dummyNode);
			assert.equal(groups.length, 3);
			assert.deepEqual(groups[0].pages, [0, 1, 2]);
			assert.deepEqual(groups[1].pages, [6]);
			assert.deepEqual(groups[2].pages, [8, 9]);
		},
	},
	{
		name: 'parsePageRanges flattens and dedupes overlapping ranges, preserving first-seen order',
		fn: () => {
			const pages = parsePageRanges('1-3,2-4', 10, dummyNode);
			assert.deepEqual(pages, [0, 1, 2, 3]);
		},
	},
	{
		name: 'parsePageRanges flattens non-overlapping tokens in expression order',
		fn: () => {
			const pages = parsePageRanges('7,1-3', 10, dummyNode);
			assert.deepEqual(pages, [6, 0, 1, 2]);
		},
	},
	{
		name: 'rejects an out-of-range start page, naming the page count',
		fn: () => {
			assertThrowsNodeOperationError(
				() => parsePageRangeGroups('15', 10, dummyNode),
				'only has 10 pages',
			);
		},
	},
	{
		name: 'rejects an out-of-range end page in a closed range, naming the page count',
		fn: () => {
			assertThrowsNodeOperationError(
				() => parsePageRangeGroups('5-20', 10, dummyNode),
				'ends at page 20',
			);
		},
	},
	{
		name: 'rejects page 0 (not 1-indexed)',
		fn: () => {
			assertThrowsNodeOperationError(() => parsePageRangeGroups('0', 10, dummyNode));
		},
	},
	{
		name: 'rejects a malformed token',
		fn: () => {
			assertThrowsNodeOperationError(
				() => parsePageRangeGroups('abc', 10, dummyNode),
				'Invalid page range',
			);
		},
	},
	{
		name: 'rejects a reversed range (start after end)',
		fn: () => {
			assertThrowsNodeOperationError(
				() => parsePageRangeGroups('5-2', 10, dummyNode),
				'is after end page',
			);
		},
	},
	{
		name: 'rejects an empty expression',
		fn: () => {
			assertThrowsNodeOperationError(() => parsePageRangeGroups('', 10, dummyNode), 'empty');
		},
	},
	{
		name: 'the thrown error carries itemIndex when provided',
		fn: () => {
			assert.throws(
				() => parsePageRangeGroups('99', 5, dummyNode, 3),
				(error) => {
					assert.equal(error.context?.itemIndex, 3);
					return true;
				},
			);
		},
	},
];
