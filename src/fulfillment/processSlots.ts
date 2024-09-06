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

const createErrorResponse = (
  sessionAttributes: Record<string, string> | undefined,
  intent: LexV2Intent,
): LexV2Result => {
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

const validateLunchType = async (
  sessionId: string,
  slot: CustomSlot,
  intent: LexV2Intent,
  cuisineType: string | undefined,
  sessionAttributes: Record<string, string> | undefined,
) => {
  if (!cuisineType) {
    throw new Error('Cuisine type is missing')
  }

  const state = await storeState({
    sessionId,
    slot,
    slotValue: { cuisineType },
  })

  if (state == null) {
    logger.debug('CuisineType already exists, proceeding to next step')
    return createCloseAction(sessionAttributes, intent, [])
  }
  return cuisineType
}

const getLunchOptions: SlotHandler = async (
  sessionId: string,
  slotKey: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const slot = CustomSlot[slotKey as keyof typeof CustomSlot]
  const cuisineType = slotValue.value.interpretedValue
  await validateLunchType(
    sessionId,
    slot,
    intent,
    cuisineType,
    sessionAttributes,
  )

  return createCloseAction(sessionAttributes, intent, [])
}

type SlotHandler = (
  sessionId: string,
  slotKey: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
) => Promise<LexV2Result>

export const processSlots: NextSlotHandler = async (
  sessionId: string,
  slots: SuggestLunchSlots,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const { OfficeLocation } = slots

  if (OfficeLocation && isSlotValue(OfficeLocation)) {
    const slotKey = 'OfficeLocation'
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
        slotValue: { cuisineType },
      })
      return getLunchOptions(
        sessionId,
        slotKey,
        nextSlotValue,
        intent,
        sessionAttributes,
      )
    }
    const officeSlotValue = intent.slots?.OfficeLocation
    if (officeSlotValue) {
      const officeLocation = OfficeLocation.value.interpretedValue

      if (!officeLocation) {
        throw new Error('Office location missing')
      }
      await storeState({
        sessionId,
        slot: CustomSlot.OfficeLocation,
        slotValue: { officeLocation },
      })

      // if office location was given and
      // new state was stored we'll fetch possible cuisine types from dynamoDb
      const supportedCuisineTypes =
        await getCuisineTypesForOfficeLocation(officeLocation)
      logger.debug('Found cuisineTypes', { supportedCuisineTypes })

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

  logger.error('OfficeLocation slot is missing or invalid')
  return createErrorResponse(sessionAttributes, intent)
}
