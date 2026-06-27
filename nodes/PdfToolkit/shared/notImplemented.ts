import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * Historical/fallback stub-error helper. Originally EVERY Tier 1 operation in
 * this scaffold threw this (before any real pdf-lib logic was wired in — see
 * PRD open question O1). As of this branch, 18/22 Tier 1 operations are
 * implemented for real, and the remaining 4 (Extract > Text, Secure >
 * Encrypt/Decrypt/Set Permissions) each have a genuine, investigated
 * engineering blocker documented in `spike/FINDINGS.md` (Q4/Q6) and use
 * {@link throwEngineUnavailable} instead, which explains WHY rather than just
 * "not implemented yet". This helper currently has no callers, but is kept as
 * the honest fallback for any future operation that's simply not started yet
 * (as opposed to blocked on an investigated bundling constraint) — do not
 * reach for `throwEngineUnavailable` for a plain "not built yet" stub, since
 * that would misrepresent an un-investigated gap as a researched blocker.
 *
 * Both helpers guarantee:
 * - the error always names the failing operation (never a library stack
 *   trace, per the PRD's UX principles), and
 * - the error always carries `itemIndex` so it can be handled by
 *   `continueOnFail()` in `PdfToolkit.node.ts`.
 *
 * `itemIndex` is optional because many-to-one operations (e.g. Document >
 * Merge) run once across ALL incoming items rather than for a single item,
 * so there's no single item to anchor the error to.
 */
export function throwNotImplemented(
	this: IExecuteFunctions,
	operationLabel: string,
	itemIndex?: number,
): never {
	throw new NodeOperationError(
		this.getNode(),
		`The "${operationLabel}" operation is not implemented yet`,
		itemIndex === undefined ? {} : { itemIndex },
	);
}

/**
 * Same contract as {@link throwNotImplemented}, but for stubs where the
 * blocker isn't "not built yet" — it's a genuine, investigated engineering
 * boundary (a required engine/library was evaluated and found impossible to
 * bundle scanner-clean, per the PRD's UX principle "errors name the failing
 * page/field, not library stack traces": a bare "not implemented yet" is
 * misleading here because it implies the fix is just "write the code").
 * `reason` should name the blocking engine and point at the written-up
 * evaluation (`spike/FINDINGS.md`) so the message is actionable, not just
 * apologetic.
 */
export function throwEngineUnavailable(
	this: IExecuteFunctions,
	operationLabel: string,
	reason: string,
	itemIndex?: number,
): never {
	throw new NodeOperationError(
		this.getNode(),
		`The "${operationLabel}" operation is not available: ${reason}`,
		itemIndex === undefined ? {} : { itemIndex },
	);
}
