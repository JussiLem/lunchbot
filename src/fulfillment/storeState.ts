import { PutCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb'
import { CustomSlot } from './customSlot'
import { dbClient } from '../common/dbClient'
import { logger } from '../common/powertools'
import { ensureError } from '../ensureError'

const stateTableName = process.env.STATE_TABLE!

interface LunchState {
  sessionId: string
  slot: CustomSlot
  slotValue: string
}

/**
 * If the item already exists (i.e., an item with the same id and intentName)
 * @return null
 * @param sessionId
 * @param intentName
 * @param slotValue
 */
export const storeState = async ({
  sessionId,
  slot,
  slotValue,
}: LunchState): Promise<void | null> => {
  const input: PutCommandInput = {
    TableName: stateTableName,
    Item: {
      id: sessionId,
      slot: slot,
      slotValue: slotValue,
    },
    ConditionExpression:
      'attribute_not_exists(id) AND attribute_not_exists(intentName)',
  }
  logger.debug('Updating state', { input })
  try {
    await dbClient.send(new PutCommand(input))
    return // Return if the new item was created successfully
  } catch (error) {
    const dynamoDbError = ensureError(error)
    if (dynamoDbError.name === 'ConditionalCheckFailedException') {
      // The item already exists; skip that
      return null
    }

    // Log and throw other errors
    logger.error('Unknown error while updating state', {
      dynamoDbError,
      sessionId,
    })
    throw dynamoDbError
  }
}
