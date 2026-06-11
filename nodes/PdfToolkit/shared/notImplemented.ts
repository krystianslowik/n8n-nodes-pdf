import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * Every Tier 1 operation in this scaffold is a stub: the actual PDF
 * manipulation logic (pdf-lib / pdfmake / pdfjs-dist, per operation — see the
 * PRD §5 "Operations — Tier 1" table) is deliberately not wired in yet,
 * because the bundling strategy for those libraries against n8n's
 * zero-runtime-dependency verification rule is still an open question.
 *
 * See PRD open question O1 ("Are zero-service utility nodes eligible for
 * verification?") in /Users/slowik/Desktop/n8n/projects/nodes/prd/pdf-node-prd.md
 * — this is a blocker-level open question that must be resolved before any
 * operation body below can be implemented for real.
 *
 * Every per-operation file in `resources/**` calls this helper instead of
 * implementing real logic, so that:
 * - the error always names the failing operation (never a library stack
 *   trace, per the PRD's UX principles), and
 * - the error always carries `itemIndex` so it can be handled by
 *   `continueOnFail()` in `PdfToolkit.node.ts`.
 */
export function throwNotImplemented(
	this: IExecuteFunctions,
	operationLabel: string,
	itemIndex: number,
): never {
	throw new NodeOperationError(
		this.getNode(),
		`The "${operationLabel}" operation is not implemented yet`,
		{ itemIndex },
	);
}
