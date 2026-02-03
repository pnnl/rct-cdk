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
  resourcePrefix: string;
  vpcId: string;
}

interface VersionedRCTStackProps extends RCTStackProps {
  api: RestApi;
  apiVersion: ApiVersion;
}

export class RctCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: RCTStackProps) {
    super(scope, id, props);

    const { resourcePrefix } = props;

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
      restApiName: `${resourcePrefix}-api`,
      // In case you want to manage binary types, uncomment the following
      binaryMediaTypes: ["application/octet-stream", "application/zip"],
      policy: mainPolicyDocument,
      deployOptions: {
        stageName: "prod"
      }
    });

    const apiKey = api.addApiKey(`${resourcePrefix}-api-key`, {
      apiKeyName: `${resourcePrefix}-api-key`,
    });
    const usagePlan = api.addUsagePlan(`${resourcePrefix}-usage-plan`, {
      name: `${resourcePrefix}-usage-plan`,
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

    new StringParameter(this, `${resourcePrefix}-api-key-param`, {
      parameterName: `/${resourcePrefix}-api-key-id`,
      stringValue: apiKey.keyId,
    });

    new StringParameter(this, `${resourcePrefix}-usage-plan-id`, {
      parameterName: `/${resourcePrefix}-usage-plan-id`,
      stringValue: usagePlan.usagePlanId,
    });

    Object.values(ApiVersion).forEach((version) => {
      this.createVersionedApiResources({
        ...props,
        apiVersion: version,
        api: api, 
      });
    });
  }

  private createVersionedApiResources(props: VersionedRCTStackProps) {
    const { resourcePrefix, apiVersion, api, vpcId } = props;
    
    const inputBucketName = Fn.importValue(`${resourcePrefix}-${apiVersion}-input-bucket-export`);
    const outputBucketName = Fn.importValue(`${resourcePrefix}-${apiVersion}-output-bucket-export`);

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
      `${resourcePrefix}-${apiVersion}-session`,
      `${resourcePrefix}-${apiVersion}-session`
    );

    const vpc = Vpc.fromLookup(
      this,
      `${resourcePrefix}-${apiVersion}-ec2`,
      { vpcId: vpcId }
    );

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
    const runRCTEvaluationLambda = new NodejsFunction(this, `${resourcePrefix}-${apiVersion}-runRCT`, {
      entry: join(__dirname, "lambdas", "run-rct.ts"),
      ...nodeJsFunctionProps,
    });

    // API spec
    const apiDocsLambda = new NodejsFunction(this, `${resourcePrefix}-${apiVersion}-apiDocs`, {
      entry: join(__dirname, "lambdas", "api-docs", "api-docs.ts"),
      ...nodeJsFunctionProps
    });

    //tracking the RCT evaluation progress
    const trackRCTProgressLambda = new NodejsFunction(
      this,
      `${resourcePrefix}-${apiVersion}-trackRCTEvaluation`,
      {
        entry: join(__dirname, "lambdas", "track-rct.ts"),
        ...nodeJsFunctionProps,
      }
    );

    //Retrieve input files
    const retrieveRCTEvaluationInputLambda = new NodejsFunction(
      this,
      `${resourcePrefix}-${apiVersion}-retrieveRCTInput`,
      {
        entry: join(__dirname, "lambdas", "retrieve-rct-input.ts"),
        ...nodeJsFunctionProps,
      }
    );

    //Retrieve output files
    const retrieveRCTEvaluationOutputLambda = new NodejsFunction(
      this,
      `${resourcePrefix}-${apiVersion}-retrieveRCTOutput`,
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
    sessionsTable.grantReadWriteData(retrieveRCTEvaluationInputLambda);
    input_bucket.grantReadWrite(runRCTEvaluationLambda);
    input_bucket.grantReadWrite(retrieveRCTEvaluationInputLambda);
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
    const retrieveRCTEvaluationInputIntegration = new LambdaIntegration(
      retrieveRCTEvaluationInputLambda
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

    const rpds = apiRoot.addResource("rpds");
    const retrieveInput = rpds.addResource("{id}");
    retrieveInput.addMethod("GET", retrieveRCTEvaluationInputIntegration, {
      apiKeyRequired: true,
      requestParameters: {
        'method.request.header.x-api-key': true,
      },
    });

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
      region: this.region,
      ...props,
    });
  }
}
