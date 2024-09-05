import {
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  RemovalPolicy,
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
    const stateTable = new dynamodb.TableV2(this, 'StateTable', {
      partitionKey: {
        type: dynamodb.AttributeType.STRING,
        name: 'id',
      },
      sortKey: {
        type: AttributeType.NUMBER,
        name: 'slot',
      },
      removalPolicy: RemovalPolicy.DESTROY,
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
