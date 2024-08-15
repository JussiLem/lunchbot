import path from 'node:path'
import {
  App,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_iam as iam,
  aws_lex as lex,
  aws_s3_assets as assets,
  Stack,
  StackProps,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class LunchBotStack extends Stack {
  constructor(
    scope: Readonly<Construct>,
    id: string,
    props: Readonly<StackProps> = {},
  ) {
    super(scope, id, props)
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

    const lexAssets = new assets.Asset(this, 'lexAssets', {
      path: path.join('../bot-files/Manifest.json'),
    })

    const lunchBot = new lex.CfnBot(this, 'LunchBot', {
      dataPrivacy: { ChildDirected: true },
      idleSessionTtlInSeconds: 300,
      name: 'LunchBot',
      roleArn: lexBotRole.roleArn,
      autoBuildBotLocales: true,
      botFileS3Location: {
        s3Bucket: lexAssets.s3BucketName,
        s3ObjectKey: lexAssets.s3ObjectKey,
      },
      testBotAliasSettings: {
        botAliasLocaleSettings: [
          {
            localeId: 'fi_FI',
            botAliasLocaleSetting: {
              enabled: true,
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
          localeId: 'fi_FI',
        },
      ],
    })
    const botAlias = new lex.CfnBotAlias(this, 'prodBotAlias', {
      botAliasName: 'prod',
      botId: lunchBot.ref,
      botAliasLocaleSettings: [
        {
          botAliasLocaleSetting: {
            enabled: true,
          },
          localeId: 'fi_FI',
        },
      ],
      botVersion: botVersion.getAtt('BotVersion').toString(),
      sentimentAnalysisSettings: { DetectSentiment: true },
    })
    const eventLambda = new nodejs.NodejsFunction(this, 'events', {
      runtime: lambda.Runtime.NODEJS_20_X,
      environment: {
        BOT_ID: botAlias.botId,
        BOT_ALIAS_ID: botAlias.attrBotAliasId,
        POWERTOOLS_LOG_LEVEL: 'DEBUG',
      },
      entry: path.join('listen-slack-events/listen-slack-events.api.ts'),
    })
    // Attach Lex permissions to the Lambda role
    eventLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'lex:StartConversation',
          // Add other Lex permissions if needed
        ],
        resources: [
          `arn:aws:lex:${Stack.of(this).region}:${Stack.of(this).account}:bot-alias/${lunchBot.attrId}/*`,
        ],
      }),
    )
  }
}

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
}

const app = new App()

new LunchBotStack(app, 'lunchbot-dev', { env: devEnv })

app.synth()
