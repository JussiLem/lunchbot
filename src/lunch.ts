import {
  Aws,
  aws_dynamodb as dynamodb,
  aws_glue as glue,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_event_sources as event_sources,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class Lunch extends Construct {
  readonly fulfillmentLambda: nodejs.NodejsFunction

  constructor(scope: Readonly<Construct>, id: string) {
    super(scope, id)
    const stack = Stack.of(this)

    const lunchTable = new dynamodb.TableV2(this, 'Table', {
      partitionKey: {
        type: dynamodb.AttributeType.STRING,
        name: 'officeLocation',
      },
      removalPolicy: RemovalPolicy.DESTROY,
      sortKey: { name: 'cuisineType', type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'GSI_OfficeLocation_CuisineType',
          partitionKey: {
            type: dynamodb.AttributeType.STRING,
            name: 'officeLocation',
          },
          sortKey: {
            type: dynamodb.AttributeType.STRING,
            name: 'cuisineType',
          },
        },
      ],
    })
    const stateTable = new dynamodb.TableV2(this, 'State', {
      partitionKey: {
        type: dynamodb.AttributeType.STRING,
        name: 'id',
      },
      sortKey: {
        type: dynamodb.AttributeType.STRING,
        name: 'slot',
      },
      deletionProtection: false,
      timeToLiveAttribute: 'expireAt',
      removalPolicy: RemovalPolicy.DESTROY,
      dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
    })

    this.fulfillmentLambda = new nodejs.NodejsFunction(
      this,
      'fulfillmentLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        logRetention: logs.RetentionDays.ONE_MONTH,
        environment: {
          SERVICE_NAME: 'lunchbot',
          POWERTOOLS_LOG_LEVEL: 'DEBUG',
          LUNCH_TABLE: lunchTable.tableName,
          STATE_TABLE: stateTable.tableName,
        },
        entry: 'src/fulfillment/fulfillment.ts',
      },
    )
    const restaurantTable = new dynamodb.TableV2(this, 'Restaurant', {
      partitionKey: {
        type: dynamodb.AttributeType.STRING,
        name: 'restaurant',
      },
      sortKey: {
        type: dynamodb.AttributeType.STRING,
        name: 'officeLocation',
      },
      removalPolicy: RemovalPolicy.DESTROY,
      dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
    })
    const crawlerRole = new iam.Role(this, 'CrawlerRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      inlinePolicies: {
        dynamoPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:DescribeTable', 'dynamodb:Scan'],
              resources: [
                stateTable.tableArn,
                restaurantTable.tableArn,
                lunchTable.tableArn,
              ],
            }),
          ],
        }),
        cloudwatch: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['logs:*'],
              resources: [
                `arn:aws:logs:${Aws.REGION}:${Aws.ACCOUNT_ID}:log-group:/aws-glue/crawlers:log-stream:*`,
              ],
            }),
          ],
        }),
      },
    })
    crawlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSGlueConsoleFullAccess'),
    )

    const dynamoDbTargets: glue.CfnCrawler.DynamoDBTargetProperty[] = [
      {
        path: restaurantTable.tableName,
      },
      {
        path: stateTable.tableName,
      },
      {
        path: lunchTable.tableName,
      },
    ]
    const targets: glue.CfnCrawler.TargetsProperty = {
      dynamoDbTargets,
    }

    new glue.CfnCrawler(this, 'Crawler', {
      role: crawlerRole.roleArn,
      targets,
      tags: {
        AppManagerCFNStackKey: stack.stackName,
        Environment: 'dev',
      },
      databaseName: 'lunch',
    })

    const streamLambda = new nodejs.NodejsFunction(this, 'streamLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        SERVICE_NAME: 'lunchbot',
        POWERTOOLS_LOG_LEVEL: 'ERROR',
        RESTAURANT_TABLE: restaurantTable.tableName,
      },
      entry: 'src/fulfillment/lunch-stream.ts',
    })
    const streamRestaurantLambda = new nodejs.NodejsFunction(
      this,
      'streamRestaurantLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        logRetention: logs.RetentionDays.ONE_MONTH,
        environment: {
          SERVICE_NAME: 'lunchbot',
          POWERTOOLS_LOG_LEVEL: 'ERROR',
          LUNCH_TABLE: lunchTable.tableName,
        },
        entry: 'src/fulfillment/restaurant-stream.ts',
      },
    )
    streamRestaurantLambda.addEventSource(
      new event_sources.DynamoEventSource(restaurantTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      }),
    )
    lunchTable.grantReadWriteData(streamRestaurantLambda)
    restaurantTable.grantStreamRead(streamRestaurantLambda)

    streamLambda.addEventSource(
      new event_sources.DynamoEventSource(stateTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      }),
    )
    restaurantTable.grantReadWriteData(streamLambda)
    stateTable.grantStreamRead(streamLambda)
    stateTable.grantReadWriteData(this.fulfillmentLambda)
    lunchTable.grantReadData(this.fulfillmentLambda)
  }
}
