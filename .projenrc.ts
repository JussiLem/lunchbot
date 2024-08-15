import { awscdk, javascript } from 'projen'
import { TrailingComma } from 'projen/lib/javascript'

const project = new awscdk.AwsCdkTypeScriptApp({
  authorName: 'Jussi Lemmetyinen',
  cdkVersion: '2.1.0',
  codeCov: true,
  defaultReleaseBranch: 'main',
  description: 'Serverless lunch bot',
  name: 'lunchbot',
  packageManager: javascript.NodePackageManager.NPM,
  eslint: true,
  prettier: true,
  prettierOptions: {
    settings: {
      singleQuote: true,
      trailingComma: TrailingComma.ALL,
      semi: false,
    },
  },
  projenrcTs: true,
  deps: [
    '@aws-lambda-powertools/logger',
    '@aws-lambda-powertools/metrics',
    '@aws-lambda-powertools/tracer',
    '@middy/core',
    '@aws-sdk/client-lex-runtime-v2',
  ],
  devDeps: ['eslint-plugin-functional@6.6.3', '@types/aws-lambda'],
  // packageName: undefined,  /* The "name" in package.json. */
})

project?.eslint?.addExtends('plugin:functional/recommended')

project?.eslint?.addRules({
  'functional/no-expression-statements': 'off',
  'functional/no-classes': 'off',
  'functional/prefer-immutable-types': [
    'off',
    {
      enforcement: 'ReadonlyDeep',
    },
  ],
})

project.synth()
