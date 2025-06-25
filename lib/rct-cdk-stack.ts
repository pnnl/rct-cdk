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

export interface RCTStackProps extends StackProps {
  applicationName: string;
  deploymentEnv: string;
}

export class RctCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: RCTStackProps) {
    super(scope, id, props);

    const { applicationName, deploymentEnv } = props;

    // get the bucket
    const inputBucketName = Fn.importValue(`${applicationName}-${deploymentEnv}-input-bucket-export`);
    const outputBucketName = Fn.importValue(`${applicationName}-${deploymentEnv}-output-bucket-export`);

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
      `${applicationName}-${deploymentEnv}-session`,
      `${applicationName}-${deploymentEnv}-session`
    );

    //vpc with 2 availability zones (not sure if it is needed.)
    const vpc = Vpc.fromLookup(
      this,
      `${applicationName}-${deploymentEnv}-ec2`,
      { vpcId: "vpc-00ff3e7b236c5f892" }
    ); //find one PNNL created

    //subnet id values
    const subnets = vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    }).subnets;

    //*************************************
    // Lambda functions
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
    const runRCTEvaluationLambda = new NodejsFunction(this, `${applicationName}-${deploymentEnv}-runRCT`, {
      entry: join(__dirname, "lambdas", "run-rct.ts"),
      ...nodeJsFunctionProps,
      // do we need to add policy for this lambda to access ECS?
    });

    // API spec
    const apiDocsLambda = new NodejsFunction(this, `${applicationName}-${deploymentEnv}-apiDocs`, {
      entry: join(__dirname, "lambdas", "api-docs", "api-docs.ts"),
      ...nodeJsFunctionProps
    });

    //tracking the RCT evaluation progress
    const trackRCTProgressLambda = new NodejsFunction(
      this,
      `${applicationName}-${deploymentEnv}-trackRCTEvaluation`,
      {
        entry: join(__dirname, "lambdas", "track-rct.ts"),
        ...nodeJsFunctionProps,
      }
    );

    //Retrieve output files
    const retrieveRCTEvaluationOutputLambda = new NodejsFunction(
      this,
      `${applicationName}-${deploymentEnv}-retrieveRCTOutput`,
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

    const mainPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["execute-api:Invoke"],
      resources: ["execute-api:/prod/*"],
      principals: [new AnyPrincipal()],
      conditions: {
        IpAddress: { "aws:SourceIp": ["130.20.0.0/16"] },
      },
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

    const apiDocs = api.root.addResource("docs");
    apiDocs.addMethod("GET", apiDocsIntegration);

    const evaluate = api.root.addResource("evaluate");
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


    const rulesets = api.root.addResource("rulesets");
    rulesets.addMethod("GET", countNumRuleSetsIntegration);
    const rules = api.root.addResource("rules")
    rules.addMethod("GET", countNumRulesIntegration);
    const reports = api.root.addResource("reports");
    reports.addMethod("GET", countNumRuleSetReportsIntegration);

    QueueProcessingLambda(this, {
      ...props,
    });
  }
}
