import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs';
import { AttributeType,  Table} from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { join } from 'path';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3'
import { EmrContainersCreateVirtualCluster } from 'aws-cdk-lib/aws-stepfunctions-tasks';

export class RctCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //Create S3 Bucket
    const bucket = new s3.Bucket(this, 'userFilesBucket', {
      /**
       *  The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
       * the new table, and it will remain in your account until manually deleted. By setting the policy to
       * DESTROY, cdk destroy will delete the table (even if it has data in it)
       */
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    //Create dynamoDB
    const sessionsTable = new Table(this, 'sessions', {
      partitionKey: {
        name: 'sessionId',
        type: AttributeType.STRING
      },
      tableName: 'sessions',

      /**
       *  The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
       * the new table, and it will remain in your account until manually deleted. By setting the policy to
       * DESTROY, cdk destroy will delete the table (even if it has data in it)
       */
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
    });

    //vpc with 2 availability zones (not sure if it is needed.)
    const vpc = new ec2.Vpc(this, 'rctVpc', {natGateways: 2, maxAzs: 2}); //parameters to be updated
    //Repo that stores the python image
    const ecsRepo = new ecr.Repository(this, 'ECRRepo', {
      repositoryName: `${props?.stackName}-package-repository`,
      lifecycleRules: [{maxImageCount: 5}] // no need to store lots of old images
    })

    //ECS cluster to deploy tasks to
    const cluster = new ecs.Cluster(this, "ECSCluster", {
      clusterName: `${props?.stackName}-cluster`,
      vpc,
      containerInsights: true // allow metrics to show up in cloudwatch
    })

    //ecs task for defining config
    const ECSTaskRunner = new ecs.TaskDefinition(this, 'ECSTaskDef', {
      family: `${props?.stackName}-task-definition`,
      compatibility: ecs.Compatibility.FARGATE,
      // memory and cpu - can be parameterized in the props.
      cpu: "1024",
      memoryMiB: "2048"
    })

    // permissions/policies may needed?
    ECSTaskRunner.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: ["ecs:StartTelemetrySession"] as string[],
      effect: iam.Effect.ALLOW,
      resources: ["*"]
    }))

    // attach the docker container to the task
    const container = ECSTaskRunner.addContainer("ECSContainer", {
      containerName: `${props?.stackName}-container`,
      image: ecs.ContainerImage.fromEcrRepository(ecsRepo, "latest"),
      environment: {
        //add any environment needed? cloud watch?
      },
      secrets: {
        // what is the secretes?
      },
      logging:ecs.LogDriver.awsLogs({streamPrefix: `${props?.stackName}-container-logs`})
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
        BUCKET_KEY: 'userFilesBucket',
        ECS_TASK_ARN: ECSTaskRunner.taskDefinitionArn,
        ECS_CLUSTER_ARN: cluster.clusterArn,
        ECS_CONTAINER_NAME: container.containerName,
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
