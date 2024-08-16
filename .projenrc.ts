import { awscdk, github, javascript } from 'projen'
import { JobPermission } from 'projen/lib/github/workflows-model'

const project = new awscdk.AwsCdkTypeScriptApp({
  authorName: 'Jussi Lemmetyinen',
  cdkVersion: '2.1.0',
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
    'semantic-release',
    '@semantic-release/changelog',
    '@semantic-release/git',
    '@semantic-release/github',
    '@semantic-release/npm',
  ],
  // packageName: undefined,  /* The "name" in package.json. */
})

project.package.addField('config', {
  commitizen: {
    path: './node_modules/cz-conventional-changelog',
  },
})

project.package.addField('release', {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message:
          'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
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

const workflow = project.github?.addWorkflow('release')
workflow?.on({
  push: {
    branches: ['main'],
  },
  release: {
    types: ['created'],
  },
})

workflow?.addJobs({
  build: {
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: JobPermission.WRITE,
    },
    env: {
      CI: 'true',
    },
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v4',
      },
      {
        name: 'Set up Node.js',
        uses: 'actions/setup-node@v4',
        with: {
          'node-version': '20.16.0',
        },
      },
      {
        name: 'Install dependencies',
        run: 'npm install',
      },
      {
        name: 'Build',
        run: 'npx projen build',
      },
      {
        name: 'Find mutations',
        id: 'self_mutation',
        run: `\
          git add . 
          git diff --staged --patch --exit-code > .repo.patch || echo "self_mutation_happened=true" >> $GITHUB_OUTPUT
        `,
        workingDirectory: './',
      },
      {
        name: 'Upload patch',
        if: 'steps.self_mutation.outputs.self_mutation_happened',
        uses: 'actions/upload-artifact@v4',
        with: {
          name: '.repo.patch',
          path: '.repo.patch',
          overwrite: true,
        },
      },
      {
        name: 'Fail build on mutation',
        if: 'steps.self_mutation.outputs.self_mutation_happened',
        run: `\
          echo "::error::Files were changed during build (see build log). If this was triggered from a fork, you will need to update your branch."
          cat .repo.patch
          exit 1
        `,
      },
      {
        name: 'Semantic Release',
        if: "github.ref == 'refs/heads/main'",
        env: {
          GITHUB_TOKEN: '${{ secrets.PROJEN_GITHUB_TOKEN }}',
          NPM_TOKEN: '${{ secrets.NPM_TOKEN }}',
        },
        run: 'npx semantic-release',
      },
      {
        name: 'Upload Build Artifacts',
        if: "startsWith(github.ref, 'refs/tags/')",
        uses: 'actions/upload-artifact@v4',
        with: {
          name: 'build-artifacts',
          path: 'cdk.out/**',
          'retention-days': 5,
        },
      },
    ],
  },
  self_mutation: {
    needs: ['build'],
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: JobPermission.WRITE,
    },
    if: 'always() && needs.build.outputs.self_mutation_happened && !(github.event.pull_request.head.repo.full_name != github.repository)',
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v4',
        with: {
          token: '${{ secrets.PROJEN_GITHUB_TOKEN }}',
          ref: '${{ github.event.pull_request.head.ref }}',
          repository: '${{ github.event.pull_request.head.repo.full_name }}',
        },
      },
      {
        name: 'Download patch',
        uses: 'actions/download-artifact@v4',
        with: {
          name: '.repo.patch',
          path: '${{ runner.temp }}',
        },
      },
      {
        name: 'Apply patch',
        run: '[ -s ${{ runner.temp }}/.repo.patch ] && git apply ${{ runner.temp }}/.repo.patch || echo "Empty patch. Skipping."',
      },
      {
        name: 'Set git identity',
        run: `\
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
        `,
      },
      {
        name: 'Push changes',
        env: {
          PULL_REQUEST_REF: '${{ github.event.pull_request.head.ref }}',
        },
        run: `\
          git add .
          git commit -s -m "chore: self mutation"
          git push origin HEAD:$PULL_REQUEST_REF
        `,
      },
    ],
  },
  deploy: {
    needs: ['build'],
    if: "startsWith(github.ref, 'refs/tags/')",
    runsOn: ['ubuntu-latest'],
    environment: 'dev',
    permissions: {
      contents: github.workflows.JobPermission.READ,
      deployments: github.workflows.JobPermission.READ,
      idToken: github.workflows.JobPermission.WRITE,
    },
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v4',
      },
      {
        name: 'Set up Node.js',
        uses: 'actions/setup-node@v4',
        with: {
          'node-version': '20.16.0',
        },
      },
      {
        name: 'Ensure cdk.out Directory is Clean',
        run: 'rm -rf cdk.out && mkdir -p cdk.out',
      },
      {
        name: 'Download Build Artifacts',
        uses: 'actions/download-artifact@v4',
        with: {
          name: 'build-artifacts',
          'github-token': '${{ secrets.PROJEN_GITHUB_TOKEN }}',
          path: 'cdk.out',
        },
      },
      {
        name: 'Set Permissions for cdk.out',
        run: 'chmod -R 755 cdk.out',
      },
      {
        name: 'Install dependencies',
        with: {
          'role-to-assume': '${{ secrets.AWS_ROLE_TO_ASSUME }}',
          'aws-region': '${{ secrets.CDK_DEFAULT_REGION }}',
        },
        run: `\
          ls -R
          echo $AWS_ROLE_TO_ASSUME
          echo $CDK_DEFAULT_REGION
          npm install
        `,
      },
      {
        name: 'Assume AWS Role',
        uses: 'aws-actions/configure-aws-credentials@v3',
        with: {
          'role-to-assume': '${{ secrets.AWS_ROLE_TO_ASSUME }}',
          'aws-region': '${{ secrets.CDK_DEFAULT_REGION }}',
        },
      },
      {
        env: {
          CDK_DEFAULT_ACCOUNT: '${{ secrets.CDK_DEFAULT_ACCOUNT }}',
          CDK_DEFAULT_REGION: '${{ secrets.CDK_DEFAULT_REGION }}',
        },
        name: 'Deploy',
        run: `\
          ls -R cdk.out
          echo "Deploying..."
          npx cdk deploy lunchbot-dev
        `,
      },
    ],
  },
})
project.synth()
