import { AttributeValue } from '@aws-sdk/client-dynamodb'
import {
  GetCommand,
  GetCommandInput,
  UpdateCommand,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { DynamoDBStreamHandler } from 'aws-lambda'
import { dbClient } from '../common/dbClient'
import { logger } from '../common/powertools'
import { ensureError } from '../ensureError'
import { Restaurant } from './restaurant'
import { RestaurantDto } from './restaurant-dto'

/**
 * Increase visit by one for given restaurant
 * @param restaurants
 */
const updateModifiedRestaurantsToOffices = async (
  restaurants: RestaurantDto[],
): Promise<void> => {
  // Map each lunch for a promise that updates the visits count
  const updatePromises = restaurants.map((restaurant) => {
    logger.debug('Restaurant state', { restaurant })

    const officeLocation = restaurant.officeLocation
    const cuisineType = restaurant.cuisineType
    if (!restaurant || !officeLocation || !cuisineType) {
      return Promise.reject(new Error('Missing needed parameters'))
    }

    const input: UpdateCommandInput = {
      TableName: process.env.RESTAURANT_TABLE!,
      Key: {
        officeLocation,
        cuisineType,
      },
      UpdateExpression: 'SET #restaurants :restaurants',
      ExpressionAttributeNames: {
        '#restaurants': 'restaurants',
      },
      ExpressionAttributeValues: {
        ':restaurants': {
          visits: restaurant.visits,
        },
      },
    }

    logger.debug('Updating state', { input })
    return dbClient.send(new UpdateCommand(input))
  })

  try {
    await Promise.all(updatePromises)
  } catch (e) {
    const error = ensureError(e)
    logger.error('Error updating visits to DynamoDB:', error)
  }
}

/**
 * Add new restaurants to existing office and cuisineType.
 * @throws error Doesn't create a new one if given Key is missing,
 * but throws an error.
 * @param restaurants
 */
const addNewRestaurantsToOffices = async (
  restaurants: RestaurantDto[],
): Promise<void> => {
  const updatePromises = restaurants.map((restaurant) => {
    logger.debug('Restaurant state', { restaurant })

    const {
      officeLocation,
      cuisineType,
      restaurant: name,
      rating,
      visits,
    } = restaurant
    if (!restaurant || !officeLocation || !cuisineType || !name) {
      return Promise.reject(new Error('Missing needed parameters'))
    }

    const input: UpdateCommandInput = {
      TableName: process.env.RESTAURANT_TABLE!,
      Key: {
        officeLocation,
        cuisineType,
      },
      UpdateExpression:
        'SET #restaurants = list_append(if_not_exists(#restaurants, :emptyList), :restaurants)',
      ExpressionAttributeNames: {
        '#restaurants': 'restaurants',
      },
      ExpressionAttributeValues: {
        ':restaurants': [
          {
            name,
            rating,
            visits,
          },
        ],
        ':emptyList': [],
      },
    }

    logger.debug('Updating state', { input })
    return dbClient.send(new UpdateCommand(input))
  })

  try {
    await Promise.all(updatePromises)
  } catch (e) {
    const error = ensureError(e)
    logger.error('Error updating visits to DynamoDB:', error)
    throw error
  }
}

/**
 * Remove restaurants from existing office and cuisineType by name.
 * @throws error Doesn't create a new one if given Key is missing,
 * but throws an error.
 * @param restaurants
 */
const removeRestaurantsFromOffices = async (
  restaurants: RestaurantDto[],
): Promise<void> => {
  const updatePromises = restaurants.map(async (restaurant) => {
    logger.debug('Restaurant state', { restaurant })

    const { officeLocation, cuisineType, restaurant: name } = restaurant
    if (!restaurant || !officeLocation || !cuisineType || !name) {
      throw new Error('Missing needed parameters')
    }

    const getInput: GetCommandInput = {
      TableName: process.env.RESTAURANT_TABLE!,
      Key: {
        officeLocation,
        cuisineType,
      },
    }

    const existingData = await dbClient.send(new GetCommand(getInput))
    if (!existingData.Item || !existingData.Item.restaurants) {
      throw new Error(
        'No restaurants found for the given officeLocation and cuisineType',
      )
    }

    const updatedRestaurants = existingData.Item.restaurants.filter(
      (r: Restaurant) => r.name !== name,
    )

    const updateInput: UpdateCommandInput = {
      TableName: process.env.RESTAURANT_TABLE!,
      Key: {
        officeLocation,
        cuisineType,
      },
      UpdateExpression: 'SET #restaurants = :restaurants',
      ExpressionAttributeNames: {
        '#restaurants': 'restaurants',
      },
      ExpressionAttributeValues: {
        ':restaurants': updatedRestaurants,
      },
    }

    logger.debug('Updating state', { updateInput })
    await dbClient.send(new UpdateCommand(updateInput))
  })

  try {
    await Promise.all(updatePromises)
  } catch (e) {
    const error = ensureError(e)
    logger.error('Error updating visits to DynamoDB:', error)
    throw error
  }
}

export const handler: DynamoDBStreamHandler = async (event) => {
  logger.debug('Received event', { event })
  // Type guard to ensure type conformity
  const isRestaurantDto = (record: unknown): record is RestaurantDto => {
    if (typeof record !== 'object' || record === null) {
      return false
    }

    const r = record as Record<string, unknown>

    return (
      typeof r.restaurant === 'string' &&
      typeof r.officeLocation === 'string' &&
      typeof r.cuisineType === 'string' &&
      (r.visits === undefined || typeof r.visits === 'number') &&
      (r.rating === undefined || typeof r.rating === 'number')
    )
  }

  const processRecords = (eventActions: string[]): RestaurantDto[] =>
    event.Records.flatMap((record) => {
      if (
        eventActions.includes(record.eventName!) &&
        record.dynamodb?.NewImage
      ) {
        const unmarshalledRecord = unmarshall(
          record.dynamodb.NewImage as { [key: string]: AttributeValue },
        )
        return isRestaurantDto(unmarshalledRecord) ? [unmarshalledRecord] : []
      }
      return []
    })
  const createdRestaurants = processRecords(['INSERT'])
  const modifiedRestaurants = processRecords(['MODIFY'])
  const removedRestaurants = processRecords(['REMOVE'])

  await Promise.all([
    addNewRestaurantsToOffices(createdRestaurants),
    updateModifiedRestaurantsToOffices(modifiedRestaurants),
    removeRestaurantsFromOffices(removedRestaurants),
  ])
}
