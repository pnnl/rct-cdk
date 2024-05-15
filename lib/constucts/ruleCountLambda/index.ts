import { Construct } from 'constructs';
import { Function, Runtime, Code, Handler } from 'aws-cdk-lib/aws-lambda';
import path = require('path');
import { Duration } from 'aws-cdk-lib';

interface RuleCountProps {
    applicationName: string
    deploymentEnv: string
}

export const RuleCountLambda = (scope: Construct, props: RuleCountProps): Function => {
    const {applicationName, deploymentEnv} = props
    // Create a Lambda function
    return new Function(scope, `${applicationName}-${deploymentEnv}-rule-lambda`, {
        runtime: Runtime.FROM_IMAGE,
        handler: Handler.FROM_IMAGE,
        code: Code.fromAssetImage(path.join(__dirname, 'lambda')),
        timeout: Duration.seconds(60),
        memorySize: 1024
    });
}