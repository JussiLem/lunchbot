import { awscdk, javascript } from 'projen'

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
      trailingComma: javascript.TrailingComma.ALL,
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
  devDeps: [
    'eslint-plugin-functional@6.6.3',
    '@types/aws-lambda',
    'commitizen',
    'cz-conventional-changelog',
  ],
  // packageName: undefined,  /* The "name" in package.json. */
})

project.package.addField('config', {
  commitizen: {
    path: './node_modules/cz-conventional-changelog',
  },
})
project.tasks.addTask('commitizen:init', {
  description: 'Initialize Commitizen with conventional changelog adapter',
  exec: 'npx commitizen init cz-conventional-changelog --save-dev --save-exact --force',
})
project.tasks.addTask('commit', {
  description: 'Run Commitizen commit',
  exec: 'npx git-cz',
})

project?.eslint?.addExtends('plugin:functional/recommended')

project?.eslint?.addRules({
  'functional/no-expression-statements': 'off',
  'functional/no-return-void': 'off',
  'functional/no-classes': 'off',
  'functional/prefer-immutable-types': [
    'off',
    {
      enforcement: 'ReadonlyDeep',
    },
  ],
})

project.synth()
