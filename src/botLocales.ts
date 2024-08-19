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
    ],
    initialResponseSetting: {
      nextStep: {
        dialogAction: {
          type: 'InvokeDialogCodeHook',
        },
      },
      codeHook: {
        invocationLabel: 'InitialResponse',
        enableCodeHookInvocation: true,
        isActive: true,
        postCodeHookSpecification: {
          failureNextStep: {
            dialogAction: {
              type: 'ElicitSlot',
              slotToElicit: 'CuisineType',
            },
          },
          successNextStep: {
            dialogAction: {
              type: 'ElicitSlot',
              slotToElicit: 'CuisineType',
            },
          },
          timeoutNextStep: {
            dialogAction: {
              type: 'EndConversation',
            },
          },
          timeoutResponse: {
            messageGroupsList: [
              {
                message: {
                  plainTextMessage: {
                    value:
                      'Sorry, I took too long to respond. Can you tell me again?',
                  },
                },
              },
            ],
          },
          failureResponse: {
            messageGroupsList: [
              {
                message: {
                  plainTextMessage: {
                    value:
                      "Sorry, I couldn't understand. Could you please repeat?",
                  },
                },
              },
            ],
          },
        },
      },
      initialResponse: {
        messageGroupsList: [
          {
            message: {
              plainTextMessage: {
                value: 'What type of cuisine are you in the mood for?',
              },
            },
          },
        ],
      },
    },
    slots: [
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
        slotName: 'CuisineType',
      },
      {
        priority: 2,
        slotName: 'DietaryRestrictions',
      },
      {
        priority: 3,
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
