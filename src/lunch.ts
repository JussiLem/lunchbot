import {
  aws_glue as glue,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_iam as iam,
  RemovalPolicy,
  Aws,
  // Aws,
} from 'aws-cdk-lib'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'

export class Lunch extends Construct {
  readonly fulfillmentLambda: nodejs.NodejsFunction

  constructor(scope: Readonly<Construct>, id: string) {
    super(scope, id)

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
        type: AttributeType.STRING,
        name: 'slot',
      },
      deletionProtection: false,
      timeToLiveAttribute: 'expireAt',
      removalPolicy: RemovalPolicy.DESTROY,
    })
    const crawlerRole = new iam.Role(this, 'CrawlerRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      inlinePolicies: {
        dynamoPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:DescribeTable', 'dynamodb:Scan'],
              resources: [stateTable.tableArn],
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
        path: stateTable.tableName,
      },
    ]
    const targets: glue.CfnCrawler.TargetsProperty = {
      dynamoDbTargets,
    }
    // const database: glue.CfnDatabase = new glue.CfnDatabase(this, 'Database', {
    //   databaseInput: {
    //     targetDatabase: {
    //       region: Aws.REGION,
    //     },
    //   },
    //   databaseName: 'lunch',
    //   catalogId: Aws.ACCOUNT_ID,
    // })
    new glue.CfnCrawler(this, 'Crawler', {
      role: crawlerRole.roleArn,
      targets,
      databaseName: 'lunch',
    })
    this.fulfillmentLambda = new nodejs.NodejsFunction(
      this,
      'fulfillmentLambda',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        environment: {
          SERVICE_NAME: 'lunchbot',
          POWERTOOLS_LOG_LEVEL: 'DEBUG',
          LUNCH_TABLE: lunchTable.tableName,
          STATE_TABLE: stateTable.tableName,
        },
        entry: 'src/fulfillment/fulfillment.ts',
      },
    )
    stateTable.grantReadWriteData(this.fulfillmentLambda)
    lunchTable.grantReadData(this.fulfillmentLambda)
  }
}
