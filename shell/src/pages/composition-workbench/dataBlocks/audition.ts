import { applyConversion, getConversion } from './acceptance';
import { defaultAuditionContext } from './auditionPlans';
import {
  auditionSupport,
  dataBlockTypeOf,
  defaultAuditionSettings,
  isBlockEmpty,
  type AuditionContext,
  type AuditionPlan,
  type AuditionSettings,
  type StoredDataBlock,
} from './registry';

/** A8: what an empty block says when its type has no more specific reason. */
export const EMPTY_AUDITION_REASON = 'This data-block is empty, so there is nothing to play yet.';

/** The conversions meant for hearing (the listener's Hear as choice); no other id is accepted as `hearAs`. */
export const HEAR_AS_CONVERSION_IDS: readonly string[] = ['values-as-midi-notes'];

export type AuditionResult = ({ ok: true } & AuditionPlan) | { ok: false; reason: string };

/**
 * The audition core (R2, W-63): a stored block and the listener's settings become ONE cycle of a
 * musical plan, or a refusal with its reason (never silent). Pure: no React, no transport.
 *
 * `hearAs` is the id of a registered conversion the listener explicitly chose (such as
 * `values-as-midi-notes`); the converted block is what plays, the stored block is untouched. Without
 * it a type with no sound of its own refuses. `context` is the transport's pulse and the rhythm voice
 * (see `AuditionContext`); absent, today's defaults apply.
 */
export function auditionBlock(
  block: StoredDataBlock,
  settings: AuditionSettings = defaultAuditionSettings,
  hearAs?: string,
  context: AuditionContext = defaultAuditionContext
): AuditionResult {
  if (hearAs !== undefined) {
    const conversion = HEAR_AS_CONVERSION_IDS.includes(hearAs) ? getConversion(hearAs) : undefined;
    if (!conversion || conversion.from !== block.typeId) {
      return { ok: false, reason: 'That way of hearing this data-block does not apply to it.' };
    }
    try {
      // The converted block plays under its own type's rules; a second conversion is never chained.
      return auditionBlock(applyConversion(conversion, block), settings, undefined, context);
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'This data-block could not be converted.',
      };
    }
  }
  const def = dataBlockTypeOf(block);
  if (!def) {
    return { ok: false, reason: 'This data-block has no registered type.' };
  }
  const support = auditionSupport(def);
  if (!support.supported) {
    return { ok: false, reason: support.reason };
  }
  const refusal =
    def.audition?.refuse?.(block) ?? (isBlockEmpty(block) ? EMPTY_AUDITION_REASON : null);
  if (refusal) {
    return { ok: false, reason: refusal };
  }
  try {
    const built = def.audition?.build(block, settings, context);
    return built
      ? { ok: true, ...built }
      : { ok: false, reason: `${def.label} has no audition yet.` };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Audition could not start.',
    };
  }
}
