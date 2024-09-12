import { QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import { dbClient } from '../common/dbClient'
import { ensureError } from '../ensureError'
import { Restaurant } from './restaurant'

const queryDynamoDb = async <T>(input: QueryCommandInput): Promise<T[]> => {
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
export const getCuisineTypesForOfficeLocation = async (
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

/**
 * Fetch all current lunch types for a given office location using GSI
 */
export const getRestaurantsByCuisineType = async (
  officeLocation: string,
  cuisineType: string,
): Promise<Restaurant[]> => {
  try {
    const input: QueryCommandInput = {
      TableName: process.env.LUNCH_TABLE!,
      KeyConditionExpression:
        'officeLocation = :officeLocation AND cuisineType = :cuisineType',
      ExpressionAttributeValues: {
        ':officeLocation': officeLocation,
        ':cuisineType': cuisineType,
      },
    }
    const command = new QueryCommand(input)
    const results = await dbClient.send(command)

    // Assuming the structure of the returned data in `results.Items` is directly compatible with the `Restaurant` type
    return results.Items?.flatMap((item) => item.restaurants) as Restaurant[]
  } catch (error) {
    const ensuredError = ensureError(error)
    throw new Error(`Unable to find given lunch types: ${ensuredError.message}`)
  }
}
