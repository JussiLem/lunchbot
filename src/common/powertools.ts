import { Logger } from '@aws-lambda-powertools/logger'
import { Metrics } from '@aws-lambda-powertools/metrics'
import { Tracer } from '@aws-lambda-powertools/tracer'

export const logger = new Logger({
  serviceName: process.env.SERVICE_NAME,
})

export const tracer = new Tracer({
  serviceName: process.env.SERVICE_NAME,
})

export const metrics = new Metrics({
  serviceName: process.env.SERVICE_NAME,
})
