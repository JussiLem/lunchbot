// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2Handler, LexV2Intent, LexV2Result } from 'aws-lambda'
import { logger } from './common/powertools'
// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2ScalarSlotValue, LexV2Slot } from 'aws-lambda/trigger/lex-v2'

interface SuggestLunchSlots {
  CuisineType?: LexV2ScalarSlotValue | null
  DietaryRestrictions?: LexV2ScalarSlotValue | null
  Budget?: LexV2ScalarSlotValue | null
}

/**
 * Ensure session state dialog action is set to Delegate, pass everything as-is
 */
const delegate = (
  sessionAttributes: Record<string, string> | undefined,
  intent: LexV2Intent,
) =>
  ({
    sessionState: {
      intent,
      sessionAttributes,
      dialogAction: {
        type: 'Delegate',
      },
    },
  }) as LexV2Result

/**
 * Type guard to ensure slot contains the expected structure
 */
const isSlotValue = (slot: LexV2Slot): slot is LexV2ScalarSlotValue => {
  return (
    slot &&
    typeof slot === 'object' &&
    'value' in slot &&
    'originalValue' in slot.value &&
    Array.isArray(slot.value.resolvedValues) &&
    'interpretedValue' in slot.value
  )
}

export const handler: LexV2Handler = async (event) => {
  logger.info('Received event', {
    event,
  })
  const { sessionState } = event
  const { sessionAttributes, intent } = sessionState
  const { name: intentName, slots } = intent
  logger.info('Current intent and slots:', {
    intentName,
    slots,
  })
  if (slots) {
    const suggestLunchSlots = slots as SuggestLunchSlots

    if (
      suggestLunchSlots.CuisineType &&
      isSlotValue(suggestLunchSlots.CuisineType)
    ) {
      const cuisineType = suggestLunchSlots.CuisineType.value.interpretedValue
      logger.info('Cuisine type detected:', { cuisineType })

      // Additional logic based on CuisineType can be added here
      return delegate(sessionAttributes, intent)
    }
  }
  return delegate(sessionAttributes, intent)
}
