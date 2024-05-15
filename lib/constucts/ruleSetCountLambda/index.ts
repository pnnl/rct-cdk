import { Construct } from 'constructs';
import { Function, Runtime, Code, Handler } from 'aws-cdk-lib/aws-lambda';
import path = require('path');
import { Duration } from 'aws-cdk-lib';

interface RuleSetCountProps {
    applicationName: string
    deploymentEnv: string
}

export const RuleSetCountLambda = (scope: Construct, props: RuleSetCountProps): Function => {
    const {applicationName, deploymentEnv} = props
    // Create a Lambda function
    return new Function(scope, `${applicationName}-${deploymentEnv}-ruleset-count-lambda`, {
        runtime: Runtime.FROM_IMAGE,
        handler: Handler.FROM_IMAGE,
        code: Code.fromAssetImage(path.join(__dirname, 'lambda')),
        timeout: Duration.seconds(60),
        memorySize: 1024
    });
}