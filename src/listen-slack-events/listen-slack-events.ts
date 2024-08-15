import { aws_lambda as lambda, aws_lambda_nodejs as nodejs } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class ListenSlackEvents extends Construct {
  constructor(scope: Construct, id: string = 'listen-slack-events') {
    super(scope, id)
    new nodejs.NodejsFunction(this, 'api', {
      runtime: lambda.Runtime.NODEJS_20_X,
    })
  }
}
