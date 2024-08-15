import { randomUUID } from 'crypto'
import {
  LexRuntimeV2Client,
  StartConversationCommand,
  StartConversationCommandInput,
  StartConversationRequestEventStream,
} from '@aws-sdk/client-lex-runtime-v2'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  Context,
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSHandler,
} from 'aws-lambda'
import { logger, metrics } from './powertools'
import { ensureError } from '../ensureError'

const lexClient = new LexRuntimeV2Client({
  region: 'eu-west-1',
})

/**
 * Async Iterable createTextInputEventStream:
 * This function generates an async iterable that yields a TextInputEventMember
 * with the text input wrapped inside a TextInputEven
 * @param text
 */
const createTextInputEventStream = async function* (
  text: string,
): AsyncIterable<StartConversationRequestEventStream> {
  yield {
    TextInputEvent: {
      text,
      eventId: randomUUID(), // Assign a unique identifier
      clientTimestampMillis: Date.now(), // Optional timestamp
    },
  }
}

// const input: RecognizeTextCommandInput = {
//   text,
//   localeId: 'fi_FI',
//   sessionId,
//   botId: process.env.BOT_ID,
//   botAliasId: process.env.BOT_ALIAS_ID,
// }
// const result = await lexClient.send(new RecognizeTextCommand(input))
// logger.debug('Result to Lex', {
//   result,
// })

/**
 * Forwards the given text to Lex V2 and starts a conversation.
 */
const forwardToLex = async (
  conversationInput: StartConversationCommandInput,
) => {
  try {
    const result = await lexClient.send(
      new StartConversationCommand(conversationInput),
    )
    logger.debug('Result to Lex:', {
      result,
    })
  } catch (e) {
    const error = ensureError(e)
    logger.error('Error forwarding to Lex:', error)
    throw error
  }
}

/**
 * Processes a single message by forwarding it to Lex.
 */
const processMessage = async (text: string): Promise<void> => {
  const sessionId = randomUUID()
  const conversationInput: StartConversationCommandInput = {
    requestEventStream: createTextInputEventStream(text),
    sessionId,
    botId: process.env.BOT_ID,
    botAliasId: process.env.BOT_ALIAS_ID,
    localeId: 'fi_FI',
    conversationMode: 'TEXT',
  }
  await forwardToLex(conversationInput)
}

/**
 * Handles a single SQS record.
 */
// Pure function to handle a record
const handleRecord = async (
  record: SQSEvent['Records'][0],
): Promise<SQSBatchItemFailure | null> => {
  try {
    logger.info(`Processing Message`, {
      body: record.body,
      messageId: record.messageId,
    })
    await processMessage(record.body)
    return null // No failure
  } catch (e) {
    const error = ensureError(e)
    logger.error(`Error processing message ID`, {
      error,
      messageId: record.messageId,
    })
    return { itemIdentifier: record.messageId } // Failure occurred
  }
}

/**
 * Lambda handler function to process SQS events.
 */
export const handler: SQSHandler = async (
  event: SQSEvent,
  context: Context,
): Promise<SQSBatchResponse> => {
  // Add context to logger
  logger.addContext(context)
  metrics.captureColdStartMetric()
  // Process all records concurrently
  const promises: Promise<SQSBatchItemFailure | null>[] =
    event.Records.map(handleRecord)

  // Wait for all promises to resolve
  const failures = await Promise.all(promises)

  // Filter out null values
  const batchItemFailures: SQSBatchItemFailure[] = failures.filter(
    (failure) => failure !== null,
  ) as SQSBatchItemFailure[]

  // Return batch item failures to acknowledge them properly
  return { batchItemFailures }
}
