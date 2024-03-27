import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AttributeType,  Table} from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction, NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { join } from 'path';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3'
// import * as sqs from 'aws-cdk-lib/aws-sqs';

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

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'RctCdkQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
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

    const nodeJsFunctionProps: NodejsFunctionProps = {
      bundling: {
        externalModules: [
          'aws-sdk',
        ],
      },
      depsLockFilePath: join(__dirname, 'lambdas', 'package-lock.json'),
      environment: {
        PRIMARY_KEY: 'sessionId',
        TABLE_NAME: sessionsTable.tableName,
        BUCKET_KEY: 'userFilesBucket'
      },
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30)
    }

    // Lambda functions
    const runRCTEvaluationLambda = new NodejsFunction(this, 'runRCTFunction', {
      entry: join(__dirname, 'lambdas', 'run-rct.ts'),
      ...nodeJsFunctionProps,
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
