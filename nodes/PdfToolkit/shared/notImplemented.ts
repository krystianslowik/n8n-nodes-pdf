import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/**
 * Fallback stub-error helper for an operation that's simply not built yet.
 * 18 of 22 Tier 1 operations are implemented for real; the remaining 4
 * (Extract > Text, Secure > Encrypt/Decrypt/Set Permissions) each have a
 * specific engine blocker and use {@link throwEngineUnavailable} instead,
 * which explains WHY rather than just "not implemented yet". This helper
 * currently has no callers, but is kept for any future operation that's
 * simply not started yet (as opposed to blocked on a known bundling
 * constraint) — do not reach for `throwEngineUnavailable` for a plain "not
 * built yet" stub, since that would misrepresent an un-investigated gap as a
 * researched blocker.
 *
 * Both helpers guarantee:
 * - the error always names the failing operation (never a library stack
 *   trace), and
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
 * blocker isn't "not built yet" — a required engine/library cannot be
 * bundled scanner-clean for this package, so a bare "not implemented yet" is
 * misleading here because it implies the fix is just "write the code".
 * `reason` should name the blocking engine and point at the README's Limits
 * section so the message is actionable, not just apologetic.
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
