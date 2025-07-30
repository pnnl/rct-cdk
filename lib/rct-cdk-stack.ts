import { Duration, Stack, StackProps, Fn } from "aws-cdk-lib";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { join } from "path";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { QueueProcessingLambda } from "./constucts/queueProcessingLambda";
import { RuleSetCountLambda } from "./constucts/ruleSetCountLambda";
import { RuleCountLambda } from "./constucts/ruleCountLambda";
import { RuleSetReportCountLambda } from "./constucts/ruleSetAvailableReportsLambda";
import { AnyPrincipal, Effect, PolicyDocument, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { ApiVersion } from "./enums/rct-version";

export interface RCTStackProps extends StackProps {
  applicationName: string;
  deploymentEnv: string;
}

interface VersionedRCTStackProps extends StackProps {
  applicationName: string;
  deploymentEnv: string;
  apiVersion: ApiVersion;
}

export class RctCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: RCTStackProps) {
    super(scope, id, props);

    const { applicationName, deploymentEnv } = props;

    const mainPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["execute-api:Invoke"],
      resources: [`execute-api:/prod/*`],
      principals: [new AnyPrincipal()],
    });

    const mainPolicyDocument = new PolicyDocument({
      statements: [mainPolicy],
    });

    // Create an API Gateway resource for each of the CRUD operations
    const api = new RestApi(this, "rct", {
      restApiName: `${applicationName}-${deploymentEnv}-api`,
      // In case you want to manage binary types, uncomment the following
      binaryMediaTypes: ["application/octet-stream", "application/zip"],
      policy: mainPolicyDocument,
      deployOptions: {
        stageName: "prod"
      }
    });

    const apiKey = api.addApiKey(`${applicationName}-${deploymentEnv}-api-key`, {
      apiKeyName: `${applicationName}-${deploymentEnv}-api-key`,
    });
    const usagePlan = api.addUsagePlan(`${applicationName}-${deploymentEnv}-usage-plan`, {
      name: `${applicationName}-${deploymentEnv}-usage-plan`,
      throttle: {
        rateLimit: 2,
        burstLimit: 3,
      },
      apiStages: [
        {
          stage: api.deploymentStage,
        },
      ],
    });
    usagePlan.addApiKey(apiKey);

    new StringParameter(this, `${applicationName}-${deploymentEnv}-api-key-param`, {
      parameterName: `/${applicationName}-${deploymentEnv}-api-key-id`,
      stringValue: apiKey.keyId,
    });

    new StringParameter(this, `${applicationName}-${deploymentEnv}-usage-plan-id`, {
      parameterName: `/${applicationName}-${deploymentEnv}-usage-plan-id`,
      stringValue: usagePlan.usagePlanId,
    });

    this.createVersionedApiResources(api, {...props, apiVersion: ApiVersion.V0})
  }

  private createVersionedApiResources(api: RestApi, props: VersionedRCTStackProps) {
    const { applicationName, deploymentEnv, apiVersion } = props;
    
    const inputBucketName = Fn.importValue(`${applicationName}-${deploymentEnv}-${apiVersion}-input-bucket-export`);
    const outputBucketName = Fn.importValue(`${applicationName}-${deploymentEnv}-${apiVersion}-output-bucket-export`);

    const input_bucket = Bucket.fromBucketName(
      this,
      inputBucketName,
      inputBucketName
    );

    const output_bucket = Bucket.fromBucketName(
      this,
      outputBucketName,
      outputBucketName
    );

    // get the dynamo table
    const sessionsTable = Table.fromTableName(
      this,
      `${applicationName}-${deploymentEnv}-${apiVersion}-session`,
      `${applicationName}-${deploymentEnv}-${apiVersion}-session`
    );

    const vpc = Vpc.fromLookup(
      this,
      `${applicationName}-${deploymentEnv}-${apiVersion}-ec2`,
      { vpcId: "vpc-00ff3e7b236c5f892" }
    ); //find one PNNL created

    //subnet id values
    const subnets = vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    }).subnets;


    const nodeJsFunctionProps: NodejsFunctionProps = {
      depsLockFilePath: join(__dirname, "package-lock.json"),
      environment: {
        PRIMARY_KEY: "sessionId",
        TABLE_NAME: sessionsTable.tableName,
        INPUT_BUCKET_KEY: inputBucketName,
        OUTPUT_BUCKET_KEY: outputBucketName,
        SUBNET_IDS: subnets.map((sub) => sub.subnetId).join(","),
      },
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
    };

    // Lambda functions
    const runRCTEvaluationLambda = new NodejsFunction(this, `${applicationName}-${deploymentEnv}-${apiVersion}-runRCT`, {
      entry: join(__dirname, "lambdas", "run-rct.ts"),
      ...nodeJsFunctionProps,
      // do we need to add policy for this lambda to access ECS?
    });

    // API spec
    const apiDocsLambda = new NodejsFunction(this, `${applicationName}-${deploymentEnv}-${apiVersion}-apiDocs`, {
      entry: join(__dirname, "lambdas", "api-docs", "api-docs.ts"),
      ...nodeJsFunctionProps
    });

    //tracking the RCT evaluation progress
    const trackRCTProgressLambda = new NodejsFunction(
      this,
      `${applicationName}-${deploymentEnv}-${apiVersion}-trackRCTEvaluation`,
      {
        entry: join(__dirname, "lambdas", "track-rct.ts"),
        ...nodeJsFunctionProps,
      }
    );

    //Retrieve output files
    const retrieveRCTEvaluationOutputLambda = new NodejsFunction(
      this,
      `${applicationName}-${deploymentEnv}-${apiVersion}-retrieveRCTOutput`,
      {
        entry: join(__dirname, "lambdas", "retrieve-rct-output.ts"),
        ...nodeJsFunctionProps,
      }
    );

    //Create other ruleset lambda constrcuts
    const rulesetCountLambda = RuleSetCountLambda(this, {
      ...props,
    })

    const ruleCountLambda = RuleCountLambda(this, {
      ...props,
    })

    const rulesetReportCountLambda = RuleSetReportCountLambda(this, {
      ...props,
    })

    // grant permissions for lambda to read/write to DynamoDB table and bucket
    sessionsTable.grantReadWriteData(runRCTEvaluationLambda);
    sessionsTable.grantReadWriteData(retrieveRCTEvaluationOutputLambda);
    sessionsTable.grantReadWriteData(trackRCTProgressLambda);
    input_bucket.grantReadWrite(runRCTEvaluationLambda);
    output_bucket.grantReadWrite(retrieveRCTEvaluationOutputLambda);

    // API gateway
    // 1. Integrate the lambda functions with API gateway resource
    const apiDocsIntegration = new LambdaIntegration(
      apiDocsLambda
    );
    const runRCTEvaluationIntegration = new LambdaIntegration(
      runRCTEvaluationLambda
    );
    const trackRCTProgressIntegration = new LambdaIntegration(
      trackRCTProgressLambda
    );
    const retrieveRCTEvaluationOutputIntegration = new LambdaIntegration(
      retrieveRCTEvaluationOutputLambda
    );
    const countNumRuleSetsIntegration = new LambdaIntegration(
      rulesetCountLambda
    );
    const countNumRulesIntegration = new LambdaIntegration(
      ruleCountLambda
    );
    const countNumRuleSetReportsIntegration = new LambdaIntegration(
      rulesetReportCountLambda
    );

    const apiRoot = api.root.addResource(apiVersion.toString());

    const apiDocs = apiRoot.addResource("docs");
    apiDocs.addMethod("GET", apiDocsIntegration);

    const evaluate = apiRoot.addResource("evaluate");
    evaluate.addMethod("POST", runRCTEvaluationIntegration, {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.header.x-api-key': true,
      },
    });

    const trackEvaluation = evaluate.addResource("{id}");
    trackEvaluation.addMethod("GET", trackRCTProgressIntegration, {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.header.x-api-key': true,
      },
    });

    trackEvaluation.addMethod("POST", retrieveRCTEvaluationOutputIntegration, {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.header.x-api-key': true,
      },
    });


    const rulesets = apiRoot.addResource("rulesets");
    rulesets.addMethod("GET", countNumRuleSetsIntegration);
    const rules = apiRoot.addResource("rules")
    rules.addMethod("GET", countNumRulesIntegration);
    const reports = apiRoot.addResource("reports");
    reports.addMethod("GET", countNumRuleSetReportsIntegration);

    QueueProcessingLambda(this, {
      ...props,
    });
  }
}
