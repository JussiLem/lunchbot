import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { LunchBotStack } from '../src/main'

// Expected patterns
const assetMatch = /[\da-f]{64}\.zip/
const bucketMatch = new RegExp(`cdk-[0-9a-z]{9}-assets`)

expect.addSnapshotSerializer({
  test: (val) =>
    typeof val === 'string' &&
    (val.match(bucketMatch) != null || val.match(assetMatch) != null),
  print: (val) => {
    // Substitute both the bucket part and the asset zip part
    // eslint-disable-next-line functional/no-let
    let sval = `${val}`
    sval = sval.replace(bucketMatch, '[ASSET BUCKET]')
    sval = sval.replace(assetMatch, '[ASSET ZIP]')
    return `"${sval}"`
  },
})
test('Snapshot', () => {
  const app = new App()
  const stack = new LunchBotStack(app, 'test')

  const template = Template.fromStack(stack)
  expect(template.toJSON()).toMatchSnapshot()
})
