import { QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import { dbClient } from '../common/dbClient'
import { ensureError } from '../ensureError'

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
