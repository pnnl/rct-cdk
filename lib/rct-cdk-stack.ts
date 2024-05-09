import { Duration, Stack, StackProps } from "aws-cdk-lib";
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

export interface RCTStackProps extends StackProps {
  applicationName: string;
  deploymentEnv: string;
}

export class RctCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: RCTStackProps) {
    super(scope, id, props);

    const { applicationName, deploymentEnv } = props;

    // get the bucket
    const bucket = Bucket.fromBucketName(
      this,
      `${applicationName}-${deploymentEnv}-bucket`,
      `${applicationName}-${deploymentEnv}-bucket`
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
        BUCKET_KEY: `${applicationName}-${deploymentEnv}-bucket`,
        SUBNET_IDS: subnets.map((sub) => sub.subnetId).join(","),
      },
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
    };

    // Lambda functions
    const runRCTEvaluationLambda = new NodejsFunction(this, "runRCTFunction", {
      entry: join(__dirname, "lambdas", "run-rct.ts"),
      ...nodeJsFunctionProps,
      // do we need to add policy for this lambda to access ECS?
    });

    //tracking the RCT evaluation progress
    const trackRCTProgressLambda = new NodejsFunction(
      this,
      "trackRCTFunction",
      {
        entry: join(__dirname, "lambdas", "track-rct.ts"),
        ...nodeJsFunctionProps,
      }
    );

    //Retrieve output files
    const retrieveRCTEvaluationOutputLambda = new NodejsFunction(
      this,
      "retrieveRCTOutputFunction",
      {
        entry: join(__dirname, "lambdas", "retrieve-rct-output.ts"),
        ...nodeJsFunctionProps,
      }
    );

    // grant permissions for lambda to read/write to DynamoDB table and bucket
    sessionsTable.grantReadWriteData(runRCTEvaluationLambda);
    sessionsTable.grantReadWriteData(trackRCTProgressLambda);
    bucket.grantReadWrite(runRCTEvaluationLambda);
    bucket.grantReadWrite(retrieveRCTEvaluationOutputLambda);

    // API gateway
    // 1. Integrate the lambda functions with API gateway resource
    const runRCTEvaluationIntegration = new LambdaIntegration(
      runRCTEvaluationLambda
    );
    const trackRCTProgressIntegration = new LambdaIntegration(
      trackRCTProgressLambda
    );
    const retrieveRCTEvaluationOutputIntegration = new LambdaIntegration(
      retrieveRCTEvaluationOutputLambda
    );

    // Create an API Gateway resource for each of the CRUD operations
    const api = new RestApi(this, "rct", {
      restApiName: "Ruleset Checking Tool Service",
      // In case you want to manage binary types, uncomment the following
      // binaryMediaTypes: ["*/*"],
    });

    const evaluate = api.root.addResource("evaluate");
    evaluate.addMethod("POST", runRCTEvaluationIntegration);

    const trackEvaluation = evaluate.addResource("{id}");
    trackEvaluation.addMethod("GET", trackRCTProgressIntegration);
    trackEvaluation.addMethod("POST", retrieveRCTEvaluationOutputIntegration);

    QueueProcessingLambda(this, {
      ...props,
    });
  }
}
