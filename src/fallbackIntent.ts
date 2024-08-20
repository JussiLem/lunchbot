import { aws_lex as lex } from 'aws-cdk-lib'

export const fallbackIntent: lex.CfnBot.IntentProperty = {
  description: 'Default intent when no other intent matches',
  initialResponseSetting: {
    nextStep: {
      dialogAction: {
        type: 'InvokeDialogCodeHook',
      },
    },
    codeHook: {
      isActive: true,
      enableCodeHookInvocation: true,
      postCodeHookSpecification: {
        successNextStep: {
          dialogAction: {
            type: 'EndConversation',
          },
        },
        failureNextStep: {
          dialogAction: {
            type: 'EndConversation',
          },
        },
      },
    },
  },
  name: 'FallbackIntent',
  parentIntentSignature: 'AMAZON.FallbackIntent',
}
