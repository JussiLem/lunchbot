// eslint-disable-next-line import/no-extraneous-dependencies
import { LexV2ImageResponseCard, LexV2Intent, LexV2Result } from 'aws-lambda'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  LexV2ContentMessage,
  LexV2ImageResponseCardMessage,
  LexV2Message,
  LexV2ScalarSlotValue,
} from 'aws-lambda/trigger/lex-v2'
import { CustomSlot } from './customSlot'
import {
  getCuisineTypesForOfficeLocation,
  getRestaurantsByCuisineType,
} from './getCuisineTypesForOfficeLocation'
import { Restaurant } from './restaurant'
import { storeState } from './storeState'
import { logger } from '../common/powertools'

export interface SuggestLunchSlots {
  OfficeLocation: LexV2ScalarSlotValue | null
  CuisineType: LexV2ScalarSlotValue | null
  DietaryRestrictions: LexV2ScalarSlotValue | null
  Budget: LexV2ScalarSlotValue | null
  Restaurants: LexV2ScalarSlotValue | null
}

const createCuisineTypeCards = (
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
  inputTranscript: string,
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

const createErrorResponse = (
  sessionAttributes: Record<string, string> | undefined,
  intent: LexV2Intent,
): LexV2Result => {
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

const getPreviousRestaurants = async (
  officeLocation: string,
  lunchType: string,
) => {
  logger.debug('Searching for previous lunch places', {
    officeLocation,
    lunchType,
  })
  return getRestaurantsByCuisineType(officeLocation, lunchType)
}

const createRestaurantCards = (
  officeLocation: string,
  restaurants: Restaurant[],
): LexV2Message[] => {
  if (restaurants.length === 0) {
    return [
      {
        contentType: 'PlainText',
        content: `no restaurants found for ${officeLocation}`,
      } as LexV2ContentMessage,
    ]
  }

  return restaurants.map(
    (restaurant) =>
      ({
        contentType: 'ImageResponseCard',
        imageResponseCard: {
          title: restaurant.name,
          subtitle: `Rating: ${restaurant.rating}/5 | Visits: ${restaurant.visits}`,
          buttons: [
            {
              text: 'Select this restaurant',
              value: `${restaurant.name} was chosen`,
            },
          ],
        } as LexV2ImageResponseCard,
      }) as LexV2ImageResponseCardMessage,
  )
}
const getLunchOptions = async (
  officeLocation: string,
  cuisineType: string,
): Promise<LexV2Message[]> => {
  const restaurants = await getPreviousRestaurants(officeLocation, cuisineType)
  logger.debug('Received restaurants', {
    restaurants,
  })
  const messages = createRestaurantCards(officeLocation, restaurants)
  return messages
}

const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60 // 7 days in seconds

const extractRestaurantFromTranscript = (transcript: string): string | null => {
  // Implement logic to extract restaurant, e.g. regex match or pattern processing
  const match = /([A-Za-z\s]+) was chosen/.exec(transcript)
  return match ? match[1] : null
}
export const processSlots: NextSlotHandler = async (
  sessionId: string,
  inputTranscript: string,
  slots: SuggestLunchSlots,
  intent: LexV2Intent,
  sessionAttributes: Record<string, string> | undefined,
): Promise<LexV2Result> => {
  const { OfficeLocation, CuisineType, Restaurants } = slots
  if (OfficeLocation) {
    const officeLocation = OfficeLocation.value.interpretedValue!
    const cuisineType = CuisineType?.value.interpretedValue!
    const slotKey = 'OfficeLocation'
    const slot = CustomSlot[slotKey as keyof typeof CustomSlot]
    logger.debug(`Slot type detected`, { slotKey, slot })
    if (Restaurants) {
      const restaurant = Restaurants.value.interpretedValue!
      await storeState({
        sessionId,
        slot: CustomSlot.Restaurants,
        slotValue: { restaurant },
        expireAt: Math.floor(Date.now() / 1000) + ONE_WEEK_IN_SECONDS,
      })
      return createCloseAction(sessionAttributes, intent, [
        {
          contentType: 'PlainText',
          content: `You selected the restaurant: ${restaurant}. Enjoy your meal!`,
        },
      ])
    }
    const extractedRestaurant = extractRestaurantFromTranscript(inputTranscript)
    if (extractedRestaurant) {
      await storeState({
        sessionId,
        slot: CustomSlot.Restaurants,
        slotValue: {
          restaurant: extractedRestaurant,
          officeLocation: officeLocation,
          cuisineType: cuisineType,
        },
        expireAt: Math.floor(Date.now() / 1000) + ONE_WEEK_IN_SECONDS,
      })
      return createCloseAction(sessionAttributes, intent, [
        {
          contentType: 'PlainText',
          content: `You selected the restaurant: ${extractedRestaurant}. Enjoy your meal!`,
        },
      ])
    }
    // Fetch the CuisineType from slots
    if (CuisineType) {
      await storeState({
        sessionId,
        slot: CustomSlot.CuisineType,
        slotValue: { cuisineType },
        expireAt: Math.floor(Date.now() / 1000) + ONE_WEEK_IN_SECONDS,
      })
      const messages = await getLunchOptions(officeLocation, cuisineType)
      const updatedIntent: LexV2Intent = {
        ...intent,
        state: 'InProgress',
      }
      return {
        sessionState: {
          intent: updatedIntent,
          sessionAttributes: {
            ...sessionAttributes,
          },
          dialogAction: {
            type: 'ElicitSlot',
            slotToElicit: CustomSlot.Restaurants,
          },
        },
        messages,
      }
    }
    await storeState({
      sessionId,
      slot: CustomSlot.OfficeLocation,
      slotValue: { officeLocation },
      expireAt: Math.floor(Date.now() / 1000) + ONE_WEEK_IN_SECONDS,
    })

    // if office location was given and
    // new state was stored we'll fetch possible cuisine types from dynamoDb
    const supportedCuisineTypes =
      await getCuisineTypesForOfficeLocation(officeLocation)
    logger.debug('Found cuisineTypes', { supportedCuisineTypes })

    const messages = createCuisineTypeCards(
      officeLocation,
      supportedCuisineTypes,
    )
    if (supportedCuisineTypes.length) {
      return createElicitSlotAction(
        CustomSlot.CuisineType,
        sessionAttributes,
        intent,
        messages,
      )
    }

    return createCloseAction(sessionAttributes, intent, [])
  }

  logger.error('OfficeLocation slot is missing or invalid')
  return createErrorResponse(sessionAttributes, intent)
}
