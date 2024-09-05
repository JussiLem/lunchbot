// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2ImageResponseCard, LexV2Intent, LexV2Result } from 'aws-lambda'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  LexV2ContentMessage,
  LexV2ImageResponseCardMessage,
  LexV2Message,
  LexV2ScalarSlotValue,
} from 'aws-lambda/trigger/lex-v2'
import { CustomSlot } from './customSlot'
import { getCuisineTypesForOfficeLocation } from './getCuisineTypesForOfficeLocation'
import { isSlotValue } from './isSlotValue'
import { storeState } from './storeState'
import { logger } from '../common/powertools'

export interface SuggestLunchSlots {
  OfficeLocation: LexV2ScalarSlotValue | null
  CuisineType: LexV2ScalarSlotValue | null
  DietaryRestrictions: LexV2ScalarSlotValue | null
  Budget: LexV2ScalarSlotValue | null
}

const createLexMessages = (
  officeLocation: string,
  supportedLunchTypes: string[],
): LexV2Message[] => {
  if (supportedLunchTypes.length === 0) {
    return [
      {
        contentType: 'PlainText',
        content: `no lunch places found for ${officeLocation}`,
      } as LexV2ContentMessage,
    ]
  }
  return [
    {
      contentType: 'ImageResponseCard',
      imageResponseCard: {
        title: 'Available Cuisines',
        imageUrl: 'https://example.com/lunch.jpg', // Update the image URL as needed
        buttons: supportedLunchTypes.map((type) => ({
          text: type,
          value: type,
        })),
      } as LexV2ImageResponseCard,
    } as LexV2ImageResponseCardMessage,
  ]
}

type NextSlotHandler = (
  sessionId: string,
  inputTranscript: string,
  slots: SuggestLunchSlots,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
) => Promise<LexV2Result>

/**
 * Ensure session state dialog action is set to Delegate, pass everything as-is
 */
export const delegate = (
  sessionAttributes: Record<string, string> | undefined,
  intent: LexV2Intent,
  messages?: LexV2Message[],
  dialogActionType: 'Delegate' | 'Close' = 'Delegate',
): LexV2Result => ({
  sessionState: {
    intent,
    sessionAttributes: {
      ...sessionAttributes,
    },
    dialogAction: {
      type: dialogActionType,
    },
  },
  messages,
})

const createElicitSlotAction = (
  slotToElicit: string,
  sessionAttributes: Record<string, string> | undefined,
  intent: LexV2Intent,
  messages: LexV2Message[],
): LexV2Result => {
  return {
    sessionState: {
      intent,
      sessionAttributes: {
        ...sessionAttributes,
      },
      dialogAction: {
        type: 'ElicitSlot',
        slotToElicit,
        slotElicitationStyle: 'Default',
      },
    },
    messages,
  }
}

const createCloseAction = (
  sessionAttributes: Record<string, string> | undefined,
  intent: LexV2Intent,
  messages: LexV2Message[],
): LexV2Result => {
  return {
    sessionState: {
      intent,
      sessionAttributes: {
        ...sessionAttributes,
      },
      dialogAction: {
        type: 'Close',
      },
    },
    messages,
  }
}

/**
 * Handles the OfficeLocation slot in a LexV2 intent.
 * Then it handles the CuisineType.
 * @param {string} sessionId - The unique identifier for the session.
 * @param {string} inputTranscript - The user's input.
 * @param {string} slotKey - The key of the current slot.
 * @param {LexV2ScalarSlotValue} slotValue - The value of the current slot.
 * @param {LexV2Intent} intent - The intent object.
 * @param {Record<string, string> | undefined} sessionAttributes - The session attributes.
 * @returns {Promise<LexV2Result | null>} The result of handling the OfficeLocation slot.
 * @throws {Error} If the office location is missing.
 * @throws {Error} If the cuisine type is missing.
 */
const handleOfficeLocation: SlotHandler = async (
  sessionId: string,
  inputTranscript: string,
  slotKey: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result | null> => {
  const slot = CustomSlot[slotKey as keyof typeof CustomSlot]
  logger.debug(`Slot type detected`, { slotKey, slot })
  // Fetch the CuisineType from slots
  const nextSlotValue = intent.slots?.CuisineType
  if (nextSlotValue && isSlotValue(nextSlotValue)) {
    const cuisineType = nextSlotValue.value.interpretedValue
    if (!cuisineType) {
      throw new Error('Cuisine type missing')
    }
    await storeState({
      sessionId,
      slot: CustomSlot.CuisineType,
      slotValue: cuisineType,
    })
    return handleCuisineType(
      sessionId,
      inputTranscript,
      slotKey,
      nextSlotValue,
      intent,
      sessionAttributes,
    )
  }
  const officeSlotValue = intent.slots?.OfficeLocation
  if (officeSlotValue) {
    const officeLocation = slotValue.value.interpretedValue

    if (!officeLocation) {
      throw new Error('Office location missing')
    }
    await storeState({
      sessionId,
      slot: CustomSlot.OfficeLocation,
      slotValue: officeLocation,
    })

    // if office location was given and
    // new state was stored we'll fetch possible cuisine types from dynamoDb
    const supportedCuisineTypes =
      await getCuisineTypesForOfficeLocation(officeLocation)
    logger.info('Found cuisineTypes', { supportedCuisineTypes })

    const messages = createLexMessages(officeLocation, supportedCuisineTypes)
    if (supportedCuisineTypes.length) {
      return createElicitSlotAction(
        'CuisineType',
        sessionAttributes,
        intent,
        messages,
      )
    }
  }

  return createCloseAction(sessionAttributes, intent, [])
}

const handleCuisineType: SlotHandler = async (
  sessionId: string,
  inputTranscript: string,
  slotKey: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const slot = CustomSlot[slotKey as keyof typeof CustomSlot]
  const cuisineType = slotValue.value.interpretedValue
  logger.info('CuisineType detected', {
    slot,
    slotKey,
    cuisineType,
    inputTranscript,
  })

  if (!cuisineType) {
    throw new Error('Cuisine type is missing')
  }

  const state = await storeState({
    sessionId,
    slot,
    slotValue: cuisineType,
  })

  if (state == null) {
    logger.debug('CuisineType already exists, proceeding to next step')
    return createCloseAction(sessionAttributes, intent, [])
  }

  return createCloseAction(sessionAttributes, intent, [])
}

type SlotHandler = (
  sessionId: string,
  slotKey: string,
  inputTranscript: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
) => Promise<LexV2Result | null>

export const processSlots: NextSlotHandler = async (
  sessionId: string,
  inputTranscript: string,
  slots: SuggestLunchSlots,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const slotHandlers: Partial<Record<keyof SuggestLunchSlots, SlotHandler>> = {
    OfficeLocation: handleOfficeLocation,
    CuisineType: handleCuisineType,
    // Add other handlers here if needed
  }

  // Use reduce to process each slot and handle them accordingly
  const finalResult = await Object.entries(slots).reduce(
    async (prevPromise, [slotKey, slotValue]) => {
      const previousResult = await prevPromise
      if (previousResult) {
        return previousResult // Exit early if we already have a valid result
      }

      if (slotValue && isSlotValue(slotValue)) {
        const handler = slotHandlers[slotKey as keyof SuggestLunchSlots]
        if (handler) {
          const handlerResult = await handler(
            sessionId,
            inputTranscript,
            slotKey,
            slotValue,
            intent,
            sessionAttributes,
          )
          if (handlerResult) {
            return handlerResult // Return the first valid result found
          }
        }
      }
      return null
    },
    Promise.resolve<LexV2Result | null>(null), // Initial value for reduce
  )

  // If no specific handler returned a valid result, delegate the action
  return finalResult ?? delegate(sessionAttributes, intent)
}
