#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { RctCdkStack } from '../lib/rct-cdk-stack';
import { RctResourceStack } from '../lib/rct-resource-stack';
import { RctApiKeyRotationStack } from '../lib/rct-api-key-rotation-stack';
import { ApiVersion } from '../lib/enums/rct-version';

require("dotenv").config();

const {
  ACCOUNT,
  REGION,
  applicationName = 'rct',
  deploymentEnv = 'dev',
  apiVersion = ApiVersion.V0
} = process.env;

const app = new App();

// Comment out of you need to check best practices then run: cdk ls
// Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

new RctResourceStack(app, `${applicationName}-${deploymentEnv}-resource-stack`, {
  env: { account: String(ACCOUNT), region: String(REGION) },
  applicationName: String(applicationName),
  deploymentEnv: String(deploymentEnv)
});

new RctCdkStack(app, `${applicationName}-${deploymentEnv}-stack`, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  env: { account: String(ACCOUNT), region: String(REGION) },
  applicationName: String(applicationName),
  deploymentEnv: String(deploymentEnv),
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

new RctApiKeyRotationStack(app, `${applicationName}-${deploymentEnv}-api-key-rotation-stack`, {
  env: { account: String(ACCOUNT), region: String(REGION) },
  applicationName: String(applicationName),
  deploymentEnv: String(deploymentEnv)
});
