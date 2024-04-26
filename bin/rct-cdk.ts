#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { RctCdkStack } from '../lib/rct-cdk-stack';
import { RctResourceStack } from '../lib/rct-resource-stack';

require("dotenv").config();

const {
  ACCOUNT,
  REGION,
  DEPLOYMENT
} = process.env;

const app = new App();

if(DEPLOYMENT == "RESOURCE")
{
  new RctResourceStack(app, 'RctCdkResource', {
    env: { account: String(ACCOUNT), region: String(REGION) },
    appName:"rct",
    deploymentEnv: "dev"
  })
}
else
{
  new RctCdkStack(app, 'RctCdkStack', {
    /* If you don't specify 'env', this stack will be environment-agnostic.
     * Account/Region-dependent features and context lookups will not work,
     * but a single synthesized template can be deployed anywhere. */
  
    /* Uncomment the next line if you know exactly what Account and Region you
     * want to deploy the stack to. */
    env: { account: String(ACCOUNT), region: String(REGION) },
    appName:"rct",
    deploymentEnv: "dev"
    /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  });
}

