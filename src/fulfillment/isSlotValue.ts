// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2ScalarSlotValue, LexV2Slot } from 'aws-lambda/trigger/lex-v2'

/**
 * Type guard to ensure slot contains the expected structure
 */
const isScalarSlotValue = (slot: LexV2Slot): slot is LexV2ScalarSlotValue =>
  Array.isArray(slot.value.resolvedValues) &&
  typeof slot.value.interpretedValue === 'string'

export const isSlotValue = (
  slot: LexV2Slot | null,
): slot is LexV2ScalarSlotValue => slot !== null && isScalarSlotValue(slot)
