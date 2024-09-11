import { PutCommand, PutCommandInput } from '@aws-sdk/lib-dynamodb'
import { dbClient } from '../common/dbClient'
import { logger } from '../common/powertools'
import { ensureError } from '../ensureError'
import { LunchState } from './lunchState'

const stateTableName = process.env.STATE_TABLE!

/**
 * If the item already exists (i.e., an item with the same id and intentName)
 * @return null
 * @param sessionId
 * @param slot
 * @param slotValue
 * @param expireAt
 * @example
 * // Example usage with multiple slotValues
 * const sessionId = 'session123';
 * const slot = CustomSlot.LunchSlot;
 * const slotValue = { restaurant: 'Place1', officeLocation: 'Location1' };
 * await storeState({
 * sessionId,
 * slot,
 * slotValue,
 * expireAt: Math.floor(Date.now() / 1000) + ONE_WEEK_IN_SECONDS
 * });
 */
export const storeState = async ({
  sessionId,
  slot,
  slotValue,
  expireAt,
}: LunchState): Promise<void | null> => {
  // Using object spread to build the item
  const item: PutCommandInput['Item'] = {
    id: sessionId,
    slot,
    expireAt,
    ...slotValue,
  }

  const input: PutCommandInput = {
    TableName: stateTableName,
    Item: item,
    ConditionExpression:
      'attribute_not_exists(id) AND attribute_not_exists(slot)',
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
