import {
  QueryCommand,
  QueryCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2ImageResponseCard, LexV2Intent, LexV2Result } from 'aws-lambda'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  LexV2ContentMessage,
  LexV2ImageResponseCardMessage,
  LexV2Message,
  LexV2ScalarSlotValue,
} from 'aws-lambda/trigger/lex-v2'
import { isSlotValue } from './isSlotValue'
import { dbClient } from '../common/dbClient'
import { logger } from '../common/powertools'
import { ensureError } from '../ensureError'

export interface SuggestLunchSlots {
  OfficeLocation: LexV2ScalarSlotValue | null
  CuisineType: LexV2ScalarSlotValue | null
  DietaryRestrictions: LexV2ScalarSlotValue | null
  Budget: LexV2ScalarSlotValue | null
}

const queryDynamoDb = async (input: QueryCommandInput): Promise<string[]> => {
  try {
    const result = await dbClient.send(new QueryCommand(input))
    if (!(result.Items && result.Items.length > 0)) {
      return [] // No items found
    }
    // Parse the results to get cuisine types
    return result.Items.map((item) => item.cuisineType)
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

enum Slot {
  OfficeLocation,
  CuisineType,
  DietaryRestrictions,
  Budget,
}

const handleOfficeLocation: SlotHandler = async (
  sessionId: string,
  slotKey: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const slot = Slot[slotKey as keyof typeof Slot]
  const officeLocation = slotValue.value.interpretedValue
  logger.info('OfficeLocation type detected', { officeLocation })
  if (!officeLocation) {
    throw new Error('Office location is missing')
  }
  await updateState({
    sessionId,
    slot,
    intentName: intent.name,
    slotValue: officeLocation,
  })
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
  return createCloseAction(sessionAttributes, intent, messages)
}

const handleCuisineType: SlotHandler = async (
  sessionId: string,
  slotKey: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const slot = Slot[slotKey as keyof typeof Slot]
  const cuisineType = slotValue.value.interpretedValue
  logger.info('CuisineType detected', { cuisineType })
  if (!cuisineType) {
    throw new Error('Cuisine type is missing')
  }
  await updateState({
    sessionId,
    slot,
    intentName: intent.name,
    slotValue: cuisineType,
  })

  // Delegate or move to the next step
  return delegate(sessionAttributes, intent)
}

type SlotHandler = (
  sessionId: string,
  slotKey: string,
  slotValue: LexV2ScalarSlotValue,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
) => Promise<LexV2Result>

const stateTableName = process.env.STATE_TABLE!

interface LunchState {
  sessionId: string
  slot: Slot
  intentName: string
  slotValue: string
  taskToken?: string
}

const updateState = async ({
  sessionId,
  slot,
  intentName,
  slotValue,
  taskToken,
}: LunchState): Promise<void> => {
  const input: UpdateCommandInput = {
    TableName: stateTableName,
    Key: {
      id: sessionId,
      intentName: intentName,
    },
    UpdateExpression: 'SET #slotValue = :slotValue, #taskToken = :taskToken',
    ExpressionAttributeNames: {
      '#slotValue': 'slotValue',
      '#taskToken': 'taskToken',
    },
    ExpressionAttributeValues: {
      ':slotValue': slotValue,
      ':taskToken': taskToken,
    },
    ConditionExpression:
      'attribute_not_exists(id) AND attribute_not_exists(intentName)', // Condition to add a new item if it doesn't exist
  }

  try {
    await dbClient.send(new UpdateCommand(input))
    return // Return if the new item was created successfully
  } catch (error) {
    const dynamoDbError = ensureError(error)
    if (dynamoDbError.name === 'ConditionalCheckFailedException') {
      // The item already exists; perform an update
      await updateExistingState(sessionId, slot, intentName)
      return // Return after updating the existing item
    }

    // Log and throw other errors
    logger.error('Error updating state', { dynamoDbError, sessionId })
    throw dynamoDbError
  }
}

const updateExistingState = async (
  sessionId: string,
  slot: Slot,
  resolvedValue: string,
): Promise<void> => {
  const updateExistingInput: UpdateCommandInput = {
    TableName: stateTableName,
    Key: {
      id: sessionId,
      slot: slot,
    },
    UpdateExpression: 'SET #value = :value',
    ExpressionAttributeNames: {
      '#value': 'value',
    },
    ExpressionAttributeValues: {
      ':value': resolvedValue,
    },
  }

  try {
    await dbClient.send(new UpdateCommand(updateExistingInput))
  } catch (updateError) {
    logger.error('Error updating existing state', { updateError, sessionId })
    throw ensureError(updateError)
  }
}

export const processSlots: NextSlotHandler = async (
  sessionId: string,
  slots: SuggestLunchSlots,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const slotHandlers: { [key in keyof SuggestLunchSlots]?: SlotHandler } = {
    OfficeLocation: handleOfficeLocation,
    CuisineType: handleCuisineType,
    // Add other handlers here if needed
  }

  const resultPromise = Object.entries(slots).reduce(
    async (accPromise, [slotKey, slotValue]) => {
      const acc = await accPromise
      if (acc) return acc // Return early if result is already found

      if (slotValue && isSlotValue(slotValue)) {
        const handler = slotHandlers[slotKey as keyof SuggestLunchSlots]
        if (handler) {
          return handler(
            sessionId,
            slotKey,
            slotValue,
            intent,
            sessionAttributes,
          )
        }
      }

      return acc
    },
    Promise.resolve<LexV2Result | null>(null),
  )

  const result = await resultPromise

  if (!result) {
    throw new Error('Unable to find the office location')
  }

  return result
}
