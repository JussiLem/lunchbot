import { awscdk, javascript } from "projen";
const project = new awscdk.AwsCdkTypeScriptApp({
  authorName: "Jussi Lemmetyinen",
  cdkVersion: "2.1.0",
  codeCov: true,
  defaultReleaseBranch: "main",
  description: "Serverless lunch bot",
  name: "lunchbot",
  packageManager: javascript.NodePackageManager.NPM,
  prettier: true,
  projenrcTs: true,

  // deps: [],                /* Runtime dependencies of this module. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
