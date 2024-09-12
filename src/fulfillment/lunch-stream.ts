import { AttributeValue } from '@aws-sdk/client-dynamodb'
import { UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { DynamoDBStreamHandler } from 'aws-lambda'
import { CustomSlot } from './customSlot'
import { Lunch } from './lunchState'
import { dbClient } from '../common/dbClient'
import { logger } from '../common/powertools'
import { ensureError } from '../ensureError'

/**
 * Increase visit by one for given restaurant
 * @param lunches
 */
const updateVisitsToDynamoDb = async (lunches: Lunch[]): Promise<void> => {
  // Map each lunch for a promise that updates the visits count
  const updatePromises = lunches.map((lunch) => {
    logger.debug('Lunch state', { lunch })

    const restaurant = lunch.restaurant
    const officeLocation = lunch.officeLocation
    const cuisineType = lunch.cuisineType
    if (!restaurant) {
      return Promise.reject(new Error('Restaurant not found'))
    }

    const input: UpdateCommandInput = {
      TableName: process.env.RESTAURANT_TABLE!,
      Key: {
        restaurant,
        officeLocation,
      },
      UpdateExpression: 'SET #cuisineType = :cuisineType ADD #visits :inc',
      ExpressionAttributeNames: {
        '#visits': 'visits',
        '#cuisineType': 'cuisineType',
      },
      ExpressionAttributeValues: {
        ':inc': 1,
        ':cuisineType': cuisineType,
      },
    }

    logger.debug('Updating state', { input })
    return dbClient.send(new UpdateCommand(input))
  })

  try {
    // Wait for all update operations to complete
    await Promise.all(updatePromises)
  } catch (e) {
    const error = ensureError(e)
    // Handle errors here, potentially logging them or taking other actions
    logger.error('Error updating visits to DynamoDB:', error)
  }
}
export const handler: DynamoDBStreamHandler = async (event) => {
  logger.debug('Received event', { event })
  const records: Lunch[] = event.Records.flatMap((record) => {
    return record.dynamodb?.NewImage
      ? unmarshall(
          record.dynamodb.NewImage as { [key: string]: AttributeValue },
        )
      : []
  })
  const lunches = records.filter(
    (record) => record.slot === CustomSlot.Restaurants,
  )
  await updateVisitsToDynamoDb(lunches)
}
