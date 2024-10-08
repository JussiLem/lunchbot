import {
  App,
  aws_iam as iam,
  aws_lex as lex,
  Stack,
  StackProps,
  Tags,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { botLocales } from './botLocales'
import { Lunch } from './lunch'

export class LunchBotStack extends Stack {
  constructor(
    scope: Readonly<Construct>,
    id: string,
    props: Readonly<StackProps> = {},
  ) {
    super(scope, id, props)
    const stack = Stack.of(this)
    const lexBotRole = new iam.Role(this, 'LexBotRole', {
      assumedBy: new iam.ServicePrincipal('lexv2.amazonaws.com'),
      inlinePolicies: {
        ['LexRuntimeRolePolicy']: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ['*'],
              actions: ['comprehend:DetectSentiment'],
            }),
          ],
        }),
      },
    })
    lexBotRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'lex:*',
          'lex:CreateBotLocale',
          'lex:CreateBot',
          'lex:StartImport',
          'lex:DescribeBot',
          'lex:DescribeBotLocale',
          'lex:DescribeBotVersion',
          'lex:ListBots',
          'lex:ListBotAliases',
          'lex:ListBotLocales',
          'lex:ListBotVersions',
          'lex:PutBotAlias',
          'lex:PutBotChannelAssociation',
        ],
        resources: ['*'],
      }),
    )

    const { fulfillmentLambda } = new Lunch(this, 'Lunch')
    const lunchBot = new lex.CfnBot(this, 'LunchBot', {
      dataPrivacy: { ChildDirected: true },
      idleSessionTtlInSeconds: 300,
      name: 'LunchBot',
      roleArn: lexBotRole.roleArn,
      autoBuildBotLocales: true,
      botLocales,
      botTags: [
        {
          key: 'AppManagerCFNStackKey',
          value: stack.stackName,
        },
        {
          key: 'Environment',
          value: 'dev',
        },
      ],
      testBotAliasSettings: {
        botAliasLocaleSettings: [
          {
            localeId: 'en_US',
            botAliasLocaleSetting: {
              enabled: true,
              codeHookSpecification: {
                lambdaCodeHook: {
                  lambdaArn: fulfillmentLambda.functionArn,
                  codeHookInterfaceVersion: '1.0',
                },
              },
            },
          },
        ],
      },
    })

    const botVersion = new lex.CfnBotVersion(this, 'LunchBotVersion', {
      botId: lunchBot.ref,
      botVersionLocaleSpecification: [
        {
          botVersionLocaleDetails: {
            sourceBotVersion: 'DRAFT',
          },
          localeId: 'en_US',
        },
      ],
    })
    new lex.CfnBotAlias(this, 'devBotAlias', {
      botAliasName: 'dev',
      botId: lunchBot.ref,
      botAliasLocaleSettings: [
        {
          botAliasLocaleSetting: {
            enabled: true,
            codeHookSpecification: {
              lambdaCodeHook: {
                lambdaArn: fulfillmentLambda.functionArn,
                codeHookInterfaceVersion: '1.0',
              },
            },
          },
          localeId: 'en_US',
        },
      ],
      botVersion: botVersion.attrBotVersion,
      sentimentAnalysisSettings: { DetectSentiment: true },
    })
    fulfillmentLambda.addPermission('Lex Invocation', {
      principal: new iam.ServicePrincipal('lexv2.amazonaws.com'),
      sourceArn: `arn:aws:lex:${Stack.of(this).region}:${Stack.of(this).account}:bot-alias/${lunchBot.attrId}/*`,
    })
    Tags.of(this).add('AppManagerCFNStackKey', stack.stackName)
    Tags.of(this).add('Environment', 'dev')
    // const eventLambda = new nodejs.NodejsFunction(this, 'events', {
    //   runtime: lambda.Runtime.NODEJS_20_X,
    //   environment: {
    //     BOT_ID: botAlias.botId,
    //     BOT_ALIAS_ID: botAlias.attrBotAliasId,
    //     POWERTOOLS_LOG_LEVEL: 'DEBUG',
    //   },
    //   entry: path.join('src/listen-slack-events/listen-slack-events.api.ts'),
    // })
    // Attach Lex permissions to the Lambda role
    // eventLambda.addToRolePolicy(
    //   new iam.PolicyStatement({
    //     actions: [
    //       'lex:StartConversation',
    //       // Add other Lex permissions if needed
    //     ],
    //     resources: [
    //       `arn:aws:lex:${Stack.of(this).region}:${Stack.of(this).account}:bot-alias/${lunchBot.attrId}/*`,
    //     ],
    //   }),
    // )
  }
}

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

const app = new App()

new LunchBotStack(app, 'lunchbot-dev', { env: devEnv })

app.synth()
