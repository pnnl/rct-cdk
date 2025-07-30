import { Construct } from 'constructs';
import { Function, Runtime, Code, Handler } from 'aws-cdk-lib/aws-lambda';
import path = require('path');
import { Duration } from 'aws-cdk-lib';
import { ApiVersion, apiVersionMap } from "../../enums/rct-version"

interface RuleCountProps {
    applicationName: string
    deploymentEnv: string,
    apiVersion: ApiVersion
}

export const RuleCountLambda = (scope: Construct, props: RuleCountProps): Function => {
    const {applicationName, deploymentEnv, apiVersion} = props
    const versionToInstall = apiVersionMap[apiVersion];
    // Create a Lambda function
    return new Function(scope, `${applicationName}-${deploymentEnv}-${apiVersion}-rule-lambda`, {
        runtime: Runtime.FROM_IMAGE,
        handler: Handler.FROM_IMAGE,
        code: Code.fromAssetImage(path.join(__dirname, 'lambda'), {
            buildArgs: {
            RCT_VERSION: versionToInstall,
            },
        }),
        timeout: Duration.seconds(60),
        memorySize: 1024,
    });
}