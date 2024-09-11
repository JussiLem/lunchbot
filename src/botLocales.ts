import { aws_lex as lex } from 'aws-cdk-lib'
import { fallbackIntent } from './fallbackIntent'

const intents: lex.CfnBot.IntentProperty[] = [
  fallbackIntent,
  {
    dialogCodeHook: {
      enabled: true,
    },
    name: 'SuggestLunch',
    description: 'Intent to suggest lunch',
    sampleUtterances: [
      { utterance: 'What should I have for lunch?' },
      { utterance: 'Give me lunch suggestions' },
      { utterance: 'Suggest a lunch option' },
      { utterance: "What's for lunch?" },
      { utterance: 'Hungry' },
    ],
    initialResponseSetting: {
      nextStep: {
        dialogAction: {
          type: 'ElicitSlot',
          slotToElicit: 'OfficeLocation',
        },
      },
    },
    slots: [
      {
        slotTypeName: 'OfficeLocations',
        name: 'OfficeLocation',
        valueElicitationSetting: {
          slotConstraint: 'Required',
          promptSpecification: {
            maxRetries: 2,
            messageGroupsList: [
              {
                message: {
                  imageResponseCard: {
                    title: 'Select your office location',
                    imageUrl:
                      'https://www.sttinfo.fi/data/images/public/69817246/70096437/ff783596-4db9-40be-bd62-d1ab7b1d75c1-w_960.jpg',
                    buttons: [
                      {
                        text: 'Kamppi',
                        value: 'Kamppi',
                      },
                      {
                        text: 'Hakaniemi',
                        value: 'Hakaniemi',
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
      {
        slotTypeName: 'CuisineType',
        name: 'CuisineType',
        valueElicitationSetting: {
          slotConstraint: 'Required',
          promptSpecification: {
            maxRetries: 2,
            messageGroupsList: [
              {
                message: {
                  plainTextMessage: {
                    value: 'What type of cuisine are you interested in?',
                  },
                },
              },
            ],
          },
        },
      },
      {
        slotTypeName: 'Restaurants',
        name: 'Restaurants',
        valueElicitationSetting: {
          slotConstraint: 'Required',
          promptSpecification: {
            maxRetries: 2,
            messageGroupsList: [
              {
                message: {
                  plainTextMessage: {
                    value: 'Pick the restaurant',
                  },
                },
              },
            ],
          },
        },
      },
      {
        slotTypeName: 'DietaryRestrictions',
        name: 'DietaryRestrictions',
        valueElicitationSetting: {
          slotConstraint: 'Optional',
          promptSpecification: {
            maxRetries: 2,
            messageGroupsList: [
              {
                message: {
                  plainTextMessage: {
                    value: 'Do you have any dietary restrictions?',
                  },
                },
              },
            ],
          },
        },
      },
      {
        slotTypeName: 'AMAZON.Number',
        name: 'Budget',
        valueElicitationSetting: {
          slotConstraint: 'Optional',
          promptSpecification: {
            maxRetries: 2,
            messageGroupsList: [
              {
                message: {
                  plainTextMessage: { value: 'What is your budget for lunch?' },
                },
              },
            ],
          },
        },
      },
    ],
    slotPriorities: [
      {
        priority: 1,
        slotName: 'OfficeLocation',
      },
      {
        priority: 2,
        slotName: 'CuisineType',
      },
      {
        priority: 3,
        slotName: 'Restaurants',
      },
      {
        priority: 4,
        slotName: 'DietaryRestrictions',
      },
      {
        priority: 5,
        slotName: 'Budget',
      },
    ],
  },
]
export const botLocales: lex.CfnBot.BotLocaleProperty[] = [
  {
    localeId: 'en_US',
    description: 'LunchBot locale',
    nluConfidenceThreshold: 0.4,
    intents,
    slotTypes: [
      {
        name: 'OfficeLocations',
        description: 'Office location',
        valueSelectionSetting: {
          resolutionStrategy: 'ORIGINAL_VALUE',
        },
        slotTypeValues: [
          { sampleValue: { value: 'Kamppi' } },
          { sampleValue: { value: 'Hakaniemi' } },
        ],
      },
      {
        name: 'DietaryRestrictions',
        description: 'Common dietary restrictions',
        valueSelectionSetting: {
          resolutionStrategy: 'ORIGINAL_VALUE',
        },
        slotTypeValues: [
          { sampleValue: { value: 'Vegetarian' } },
          { sampleValue: { value: 'Vegan' } },
        ],
      },
      {
        name: 'Restaurants',
        description: 'Possible lunch restaurants',
        valueSelectionSetting: {
          resolutionStrategy: 'ORIGINAL_VALUE',
        },
        slotTypeValues: [
          { sampleValue: { value: 'Thai Restaurant' } },
          { sampleValue: { value: 'Chinese Restaurant' } },
          { sampleValue: { value: 'Buffet Restaurant' } },
        ],
      },
      {
        valueSelectionSetting: {
          resolutionStrategy: 'ORIGINAL_VALUE',
        },
        description: 'Types of cuisine',
        name: 'CuisineType',
        slotTypeValues: [
          {
            sampleValue: {
              value: 'Italian',
            },
          },
          {
            sampleValue: {
              value: 'Chinese',
            },
          },
          {
            sampleValue: {
              value: 'Mexican',
            },
          },
          {
            sampleValue: {
              value: 'Indian',
            },
          },
          {
            sampleValue: {
              value: 'American',
            },
          },
        ],
      },
    ],
  },
]
