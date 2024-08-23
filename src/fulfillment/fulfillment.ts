import { QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  LexV2Handler,
  LexV2ImageResponseCard,
  LexV2Intent,
  LexV2Result,
} from 'aws-lambda'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  LexV2ContentMessage,
  LexV2ImageResponseCardMessage,
  LexV2Message,
  LexV2ScalarSlotValue,
  LexV2Slot,
} from 'aws-lambda/trigger/lex-v2'
import { dbClient } from '../common/dbClient'
import { logger } from '../common/powertools'
import { ensureError } from '../ensureError'

interface SuggestLunchSlots {
  OfficeLocation: LexV2ScalarSlotValue | null
  CuisineType: LexV2ScalarSlotValue | null
  DietaryRestrictions: LexV2ScalarSlotValue | null
  Budget: LexV2ScalarSlotValue | null
}

/**
 * Type guard to ensure slot contains the expected structure
 */
const isScalarSlotValue = (slot: LexV2Slot): slot is LexV2ScalarSlotValue =>
  Array.isArray(slot.value.resolvedValues) &&
  typeof slot.value.interpretedValue === 'string'

const isSlotValue = (slot: LexV2Slot | null): slot is LexV2ScalarSlotValue =>
  slot !== null && isScalarSlotValue(slot)

const queryDynamoDb = async (input: QueryCommandInput): Promise<string[]> => {
  try {
    const result = await dbClient.send(new QueryCommand(input))
    if (!(result.Items && result.Items.length > 0)) {
      return [] // No items found
    }
    // Parse the results to get cuisine types
    const cuisineTypes = result.Items.map((item) => item.cuisineType)

    return cuisineTypes
  } catch (error) {
    throw new Error(`Query failed: ${(error as Error).message}`)
  }
}

/**
 * Fetch all current lunch types for a given office location using GSI
 */
const getCuisineTypesForOfficeLocation = async (
  officeLocation: string,
): Promise<string[]> => {
  try {
    const input: QueryCommandInput = {
      TableName: process.env.LUNCH_TABLE!,
      KeyConditionExpression: 'officeLocation = :officeLocation',
      ExpressionAttributeValues: {
        ':officeLocation': officeLocation,
      },
      ProjectionExpression: 'cuisineType',
    }

    return await queryDynamoDb(input)
  } catch (error) {
    const ensuredError = ensureError(error)
    throw new Error(`Unable to find given lunch types: ${ensuredError.message}`)
  }
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
  slots: SuggestLunchSlots,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
) => Promise<LexV2Result>

/**
 * Ensure session state dialog action is set to Delegate, pass everything as-is
 */
const delegate = (
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

const processSlots: NextSlotHandler = async (
  slots: SuggestLunchSlots,
  intent: LexV2Intent,
  sessionAttributes?: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  if (slots.OfficeLocation && isSlotValue(slots.OfficeLocation)) {
    const officeLocation = slots.OfficeLocation.value.interpretedValue
    logger.info('OfficeLocation type detected', { officeLocation })
    if (!officeLocation) {
      throw new Error('Office location is missing')
    }
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
    } else {
      return createCloseAction(sessionAttributes, intent, messages)
    }
  }

  if (slots.CuisineType && isSlotValue(slots.CuisineType)) {
    const cuisineType = slots.CuisineType.value.interpretedValue
    logger.info('CuisineType detected', { cuisineType })
    // Logic to process 'CuisineType' and move to the next relevant step

    // Assume you have other slots to fill or a finalization step
    // Replace this logic as needed to move to the next step
    return delegate(sessionAttributes, intent)
  }

  throw new Error('Unable to find the office location')
}

export const handler: LexV2Handler = async (event): Promise<LexV2Result> => {
  logger.debug('Received event', {
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
      }
      if (
        suggestLunchSlots.OfficeLocation &&
        isSlotValue(suggestLunchSlots.OfficeLocation)
      ) {
        const result = await processSlots(
          suggestLunchSlots,
          intent,
          sessionAttributes,
        )
        return result
      }
    } catch (e) {
      const error = ensureError(e)
      logger.error('Error processing slot:', { error })
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
