#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { RctCdkStack } from '../lib/rct-cdk-stack';
import { RctResourceStack } from '../lib/rct-resource-stack';
import { RctApiKeyRotationStack } from '../lib/rct-api-key-rotation-stack';

require("dotenv").config();

const {
  ACCOUNT,
  REGION,
  APPLICATION_NAME = 'rct',
  DEPLOYMENT_ENV = 'dev',
  VPC_ID
} = process.env;

const app = new App();

// Comment out of you need to check best practices then run: cdk ls
// Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const resourcePrefix = `${APPLICATION_NAME}-${DEPLOYMENT_ENV}`;

new RctResourceStack(app, `${resourcePrefix}-resource-stack`, {
  env: { account: String(ACCOUNT), region: String(REGION) },
  resourcePrefix: resourcePrefix,
});

new RctCdkStack(app, `${resourcePrefix}-stack`, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  env: { account: String(ACCOUNT), region: String(REGION) },
  resourcePrefix: resourcePrefix,
  vpcId: String(VPC_ID)
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

new RctApiKeyRotationStack(app, `${resourcePrefix}-api-key-rotation-stack`, {
  env: { account: String(ACCOUNT), region: String(REGION) },
  resourcePrefix: resourcePrefix,
  vpcId: String(VPC_ID)
});
