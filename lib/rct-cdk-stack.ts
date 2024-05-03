import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as logs from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs';
import { Table} from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { join } from 'path';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3'
import { QueueProcessingFargateService } from 'aws-cdk-lib/aws-ecs-patterns';

export interface RCTStackProps extends cdk.StackProps {
  appName: string, //rct
  deploymentEnv: string, //dev, prod,.. 
}

export class RctCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: RCTStackProps) {
    super(scope, id, props);

    // get the bucket
    const bucket = s3.Bucket.fromBucketName(this, `${props?.appName}-${props?.deploymentEnv}-bucket`, `${props?.appName}-${props?.deploymentEnv}-bucket`)
    // get the dynamo table
    const sessionsTable = Table.fromTableName(this, `${props?.appName}-${props?.deploymentEnv}-session`, `${props?.appName}-${props?.deploymentEnv}-session`)
    // get the ecs repo
    const ecsRepo = ecr.Repository.fromRepositoryName(this, `${props?.appName}-${props?.deploymentEnv}-package-repository`, `${props?.appName}-${props?.deploymentEnv}-package-repository`)
    // get the log group
    const rctLogGroup = logs.LogGroup.fromLogGroupName(this, `${props?.appName}-${props?.deploymentEnv}-log-group`, `${props?.appName}-${props?.deploymentEnv}-log-group`)

    //vpc with 2 availability zones (not sure if it is needed.)
    const vpc = ec2.Vpc.fromLookup(this, `${props?.appName}-${props?.deploymentEnv}-ec2`, {vpcId: 'vpc-00ff3e7b236c5f892'}) //find one PNNL created

    //ECS cluster to deploy tasks to
    const cluster = new ecs.Cluster(this, `${props?.appName}-${props?.deploymentEnv}-cluster`, {
      clusterName: `${props?.appName}-${props?.deploymentEnv}-cluster`,
      vpc,
      containerInsights: true // allow metrics to show up in cloudwatch
    })

    // permissions/policies may needed?
    //ECSTaskRunner.addToTaskRolePolicy(new iam.PolicyStatement({
    //  actions: ["ecs:StartTelemetrySession"] as string[],
    //  effect: iam.Effect.ALLOW,
    //  resources: ["*"]
    //}))
    const taskDefinition = new ecs.FargateTaskDefinition(this, `${props?.appName}-${props?.deploymentEnv}-taskDef`)
    taskDefinition.addContainer(`${props?.appName}-${props?.deploymentEnv}-container`, {
      image: ecs.ContainerImage.fromEcrRepository(ecsRepo, "latest"),
    })

    const queuedFargateService = new QueueProcessingFargateService(this, "rctRunQueue", {
      cluster,
      taskDefinition,
      cpu: 1024,
      memoryLimitMiB: 2048,
      environment: {
        //add any environment needed? cloud watch?
      },
      secrets: {
        // what is the secretes?
      },
      logDriver:ecs.LogDriver.awsLogs({streamPrefix: `${props?.appName}-${props?.deploymentEnv}-container-logs`, logGroup: rctLogGroup})
    })

    //subnet id values
    const subnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
    }).subnets;

    //*************************************
    // Lambda functions
    const nodeJsFunctionProps: NodejsFunctionProps = {
      depsLockFilePath: join(__dirname, 'package-lock.json'),
      environment: {
        PRIMARY_KEY: 'sessionId',
        TABLE_NAME: sessionsTable.tableName,
        BUCKET_KEY: `${props?.appName}-${props?.deploymentEnv}-bucket`,
        SERVICE_NAME: queuedFargateService.service.serviceName,
        TASK_DEFINITION_ARN: queuedFargateService.taskDefinition.taskDefinitionArn,
        ECS_CLUSTER_ARN: queuedFargateService.cluster.clusterArn,
        SUBNET_IDS: subnets.map(sub => sub.subnetId).join(","),
      },
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30)
    }

    // Lambda functions
    const runRCTEvaluationLambda = new NodejsFunction(this, 'runRCTFunction', {
      entry: join(__dirname, 'lambdas', 'run-rct.ts'),
      ...nodeJsFunctionProps,
      // do we need to add policy for this lambda to access ECS?
    });

    //tracking the RCT evaluation progress
    const trackRCTProgressLambda = new NodejsFunction(this, 'trackRCTFunction', {
      entry: join(__dirname, 'lambdas', 'track-rct.ts'),
      ...nodeJsFunctionProps,
    })

    //Retrieve output files
    const retrieveRCTEvaluationOutputLambda = new NodejsFunction(this, 'retrieveRCTOutputFunction', {
      entry: join(__dirname, 'lambdas', 'retrieve-rct-output.ts'),
      ...nodeJsFunctionProps,
    })

    // grant permissions for lambda to read/write to DynamoDB table and bucket
    sessionsTable.grantReadWriteData(runRCTEvaluationLambda);
    sessionsTable.grantReadWriteData(trackRCTProgressLambda);
    bucket.grantReadWrite(runRCTEvaluationLambda);
    bucket.grantReadWrite(retrieveRCTEvaluationOutputLambda);

    // grant permission for lambda to run ecs task
    taskDefinition.grantRun(runRCTEvaluationLambda);

    // API gateway
    // 1. Integrate the lambda functions with API gateway resource
    const runRCTEvaluationIntegration = new LambdaIntegration(runRCTEvaluationLambda);
    const trackRCTProgressIntegration = new LambdaIntegration(trackRCTProgressLambda);
    const retrieveRCTEvaluationOutputIntegration = new LambdaIntegration(retrieveRCTEvaluationOutputLambda);

    // Create an API Gateway resource for each of the CRUD operations
    const api = new RestApi(this, 'rct', {
      restApiName: 'Ruleset Checking Tool Service'
      // In case you want to manage binary types, uncomment the following
      // binaryMediaTypes: ["*/*"],
    });

    const evaluate = api.root.addResource('evaluate')
    evaluate.addMethod('POST', runRCTEvaluationIntegration);

    const trackEvaluation = evaluate.addResource('{id}');
    trackEvaluation.addMethod('GET', trackRCTProgressIntegration);
    trackEvaluation.addMethod('POST', retrieveRCTEvaluationOutputIntegration);
  }
}
