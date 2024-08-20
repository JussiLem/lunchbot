import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb'
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
import { logger, tracer } from './common/powertools'
import { ensureError } from './ensureError'

export const dbClient = tracer.captureAWSv3Client(
  DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: process.env.AWS_REGION,
    }),
  ),
)

interface SuggestLunchSlots {
  OfficeLocation?: LexV2ScalarSlotValue | null
  CuisineType?: LexV2ScalarSlotValue | null
  DietaryRestrictions?: LexV2ScalarSlotValue | null
  Budget?: LexV2ScalarSlotValue | null
}

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

const queryDynamoDb = async (input: QueryCommandInput): Promise<string[]> => {
  try {
    const result = await dbClient.send(new QueryCommand(input))
    if (result.Items?.length) {
      return result.Items[0] as string[]
    }
    return []
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
      IndexName: 'GSI_OfficeLocation_CuisineType', // Replace with your actual GSI name
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
  if (!supportedLunchTypes.length) {
    return [
      {
        contentType: 'PlainText',
        content: `no lunch places found for given location: ${officeLocation}`,
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

const processSlots = async (
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
    const supportedLunchTypes =
      await getCuisineTypesForOfficeLocation(officeLocation)
    const messages = createLexMessages(officeLocation, supportedLunchTypes)
    const dialogActionType = supportedLunchTypes.length ? 'Delegate' : 'Close'
    return delegate(sessionAttributes, intent, messages, dialogActionType)
  }
  if (slots.CuisineType && isSlotValue(slots.CuisineType)) {
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
      const suggestLunchSlots = slots as SuggestLunchSlots
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
