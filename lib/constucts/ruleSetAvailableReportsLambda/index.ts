import { Construct } from 'constructs';
import { Function, Runtime, Code, Handler } from 'aws-cdk-lib/aws-lambda';
import path = require('path');
import { Duration } from 'aws-cdk-lib';
import { ApiVersion, apiVersionMap } from "../../enums/rct-version"

interface RuleSetReportsCountProps {
    resourcePrefix: string
    apiVersion: ApiVersion
}

export const RuleSetReportCountLambda = (scope: Construct, props: RuleSetReportsCountProps): Function => {
    const {resourcePrefix, apiVersion} = props
    const versionToInstall = apiVersionMap[apiVersion];
    // Create a Lambda function
    return new Function(scope, `${resourcePrefix}-${apiVersion}-ruleset-reports-lambda`, {
        runtime: Runtime.FROM_IMAGE,
        handler: Handler.FROM_IMAGE,
        code: Code.fromAssetImage(path.join(__dirname, 'lambda'), {
            buildArgs: {
                RCT_VERSION: versionToInstall,
            },
        }),
        timeout: Duration.seconds(60),
        memorySize: 1024
    });
}