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

interface UpdateParams {
  UpdateExpression: string
  ExpressionAttributeNames: { [key: string]: string }
  ExpressionAttributeValues: { [key: string]: any }
}

const createUpdateParams = (restaurant: RestaurantDto): UpdateParams => {
  const { restaurant: name, visits, rating } = restaurant

  const newRestaurant = {
    name,
    ...(visits !== undefined && { visits }),
    ...(rating !== undefined && { rating }),
  }

  const baseExpressionAttributeValues = {
    ':restaurants': [newRestaurant], // Ensure this is an array
    ':emptyList': [],
    ...(rating !== undefined && {
      ':rating': rating,
      ':visitIncrement': visits ?? 1, // Increment by visits or default to 1 if undefined
      ':zero': 0,
    }),
  }

  const baseExpressionAttributeNames = {
    '#restaurants': 'restaurants',
    ...(rating !== undefined && {
      '#totalVisits': 'totalVisits',
      '#totalRating': 'totalRating',
      '#averageRating': 'averageRating',
    }),
  }

  const updateExpressions = [
    'SET #restaurants = list_append(if_not_exists(#restaurants, :emptyList), :restaurants)',
    ...(rating !== undefined
      ? [
          'ADD #totalVisits :visitIncrement',
          'SET #totalRating = if_not_exists(#totalRating, :zero) + :rating, #averageRating = #totalRating / #totalVisits',
        ]
      : []),
  ]

  const UpdateExpression = updateExpressions.join(', ')

  return {
    UpdateExpression,
    ExpressionAttributeNames: baseExpressionAttributeNames,
    ExpressionAttributeValues: baseExpressionAttributeValues,
  }
}

/**
 * Increase visit by one for given restaurant
 * @param restaurants
 */
const updateModifiedRestaurantsToOffices = async (
  restaurants: RestaurantDto[],
): Promise<void> => {
  const updatePromises = restaurants.map((restaurant) => {
    logger.debug('Restaurant state', { restaurant })

    const { officeLocation, cuisineType, restaurant: name } = restaurant
    if (!officeLocation || !cuisineType || !name) {
      return Promise.reject(new Error('Missing needed parameters'))
    }

    const {
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    } = createUpdateParams(restaurant)

    const input: UpdateCommandInput = {
      TableName: process.env.LUNCH_TABLE!,
      Key: {
        officeLocation,
        cuisineType,
      },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    }

    logger.debug('Updating state', { input })
    return dbClient.send(new UpdateCommand(input))
  })

  try {
    await Promise.all(updatePromises)
  } catch (error_) {
    const error = ensureError(error_)
    logger.error('Error updating visits to DynamoDB:', error)
    throw error
  }
}

/**
 * Add new restaurants to existing office locations and cuisine types. Optionally,
 * if a rating is provided, update the average rating for the cuisine type and office location.
 *
 * This function:
 * - Adds new restaurants to the specified office and cuisine type.
 * - Updates the total number of visits and ratings, and recalculates the average rating when a rating is provided.
 * - Ensures immutability by avoiding mutation of existing objects and using a functional composition approach.
 *
 * @throws {Error} If a required parameter (officeLocation, cuisineType, or name) is missing.
 * @param {RestaurantDto[]} restaurants - An array of restaurant data transfer objects.
 * @returns {Promise<void>} - A promise that resolves when all updates are completed.
 */
const addNewRestaurantsToOffices = async (
  restaurants: RestaurantDto[],
): Promise<void> => {
  const updatePromises = restaurants.map((restaurant) => {
    logger.debug('Restaurant state', { restaurant })

    const { officeLocation, cuisineType, restaurant: name } = restaurant
    if (!officeLocation || !cuisineType || !name) {
      return Promise.reject(new Error('Missing needed parameters'))
    }

    const {
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    } = createUpdateParams(restaurant)

    const input: UpdateCommandInput = {
      TableName: process.env.LUNCH_TABLE!,
      Key: {
        officeLocation,
        cuisineType,
      },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    }

    logger.debug('Updating state', { input })
    return dbClient.send(new UpdateCommand(input))
  })

  try {
    await Promise.all(updatePromises)
  } catch (error_) {
    const error = ensureError(error_)
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
      TableName: process.env.LUNCH_TABLE!,
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
      TableName: process.env.LUNCH_TABLE!,
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
  } catch (error_) {
    const error = ensureError(error_)
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
      (r.visits === undefined || typeof r.visits === 'number')
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
