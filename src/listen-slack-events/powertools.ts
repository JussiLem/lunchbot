import { Logger } from '@aws-lambda-powertools/logger'
import { Metrics } from '@aws-lambda-powertools/metrics'
import { Tracer } from '@aws-lambda-powertools/tracer'

export const logger = new Logger({
  serviceName: 'listen-slack-events',
})

export const tracer = new Tracer({
  serviceName: 'listen-slack-events',
})

export const metrics = new Metrics({
  serviceName: 'listen-slack-events',
})
