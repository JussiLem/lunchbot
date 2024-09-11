// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2Handler, LexV2Result } from 'aws-lambda'
// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2ContentMessage } from 'aws-lambda/trigger/lex-v2'
import { isSlotValue } from './isSlotValue'
import { delegate, processSlots, SuggestLunchSlots } from './processSlots'
import { logger } from '../common/powertools'
import { ensureError } from '../ensureError'

export const handler: LexV2Handler = async (event): Promise<LexV2Result> => {
  logger.debug('Received event', {
    event,
  })
  const { sessionState, sessionId, inputTranscript } = event
  const { sessionAttributes, intent } = sessionState
  const { name: intentName, slots } = intent
  logger.debug('Current intent and slots', {
    intentName,
    slots,
    sessionId,
  })

  if (!slots) {
    logger.error('Missing slots in the input data')
    return delegate(
      sessionAttributes,
      intent,
      [
        {
          contentType: 'PlainText',
          content: 'An error occurred while processing your request.',
        } as LexV2ContentMessage,
      ],
      'Close',
    )
  }
  try {
    const suggestLunchSlots: SuggestLunchSlots = {
      OfficeLocation: isSlotValue(slots.OfficeLocation)
        ? slots.OfficeLocation
        : null,
      CuisineType: isSlotValue(slots.CuisineType) ? slots.CuisineType : null,
      DietaryRestrictions: isSlotValue(slots.DietaryRestrictions)
        ? slots.DietaryRestrictions
        : null,
      Budget: isSlotValue(slots.Budget) ? slots.Budget : null,
      Restaurants: isSlotValue(slots.Restaurants) ? slots.Restaurants : null,
    }
    const result = await processSlots(
      sessionId,
      inputTranscript,
      suggestLunchSlots,
      intent,
      sessionAttributes,
    )
    return result
  } catch (e) {
    const error = ensureError(e)
    logger.error('Error processing slot', { error })
    return delegate(
      sessionAttributes,
      intent,
      [
        {
          contentType: 'PlainText',
          content: 'An error occurred while processing your request.',
        } as LexV2ContentMessage,
      ],
      'Close',
    )
  }
}
