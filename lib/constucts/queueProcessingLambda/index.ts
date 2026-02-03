import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Function, Runtime, Code, Handler } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import path = require('path');
import { FilterPattern, LogGroup, SubscriptionFilter } from 'aws-cdk-lib/aws-logs';
import { LambdaDestination } from 'aws-cdk-lib/aws-logs-destinations';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { ApiVersion, apiVersionMap } from "../../enums/rct-version"

interface QueueProcessingLambdaProps {
    region: string
    resourcePrefix: string
    apiVersion: ApiVersion
}

export const QueueProcessingLambda = (scope: Construct, props: QueueProcessingLambdaProps) => {

    const { region, resourcePrefix, apiVersion } = props;

    const inputBucketName = Fn.importValue(`${resourcePrefix}-${apiVersion}-input-bucket-export`);
    const outputBucketName = Fn.importValue(`${resourcePrefix}-${apiVersion}-output-bucket-export`);

    const inputBucket = Bucket.fromBucketName(scope, `${resourcePrefix}-${apiVersion}-input-bucket`, inputBucketName);
    const outputBucket = Bucket.fromBucketName(scope, `${resourcePrefix}-${apiVersion}-output-bucket`, outputBucketName);

    // Create an SQS dead letter queue
    const dlqueue = new Queue(scope, `${resourcePrefix}-${apiVersion}-dl-queue`, {
        retentionPeriod: Duration.days(14)
    });

    // Create an SQS queue
    const queue = new Queue(scope, `${resourcePrefix}-${apiVersion}-queue`, {
        visibilityTimeout: Duration.seconds(900),
        receiveMessageWaitTime: Duration.seconds(20), // Long polling
        retentionPeriod: Duration.days(4),
        deadLetterQueue: {
            // Queue failed messages get sent to
            queue: dlqueue,
            // Allow 3 retries
            maxReceiveCount: 3
        }
    });

    const ruleCheckLogGroup = new LogGroup(scope, `${resourcePrefix}-${apiVersion}-check-log-group`, {
        removalPolicy: RemovalPolicy.DESTROY
    });

    const versionToInstall = apiVersionMap[apiVersion];
    // Create a Lambda function
    const lambdaFunctionCheck = new Function(scope, `${resourcePrefix}-${apiVersion}-check-lambda`, {
        runtime: Runtime.FROM_IMAGE,
        handler: Handler.FROM_IMAGE,
        code: Code.fromAssetImage(path.join(__dirname, 'lambda'), {
            buildArgs: {
                RCT_VERSION: versionToInstall,
            },
        }),
        timeout: Duration.minutes(15),
        memorySize: 1024,
        environment: {
            inputBucket: inputBucket.bucketName,
            outputBucket: outputBucket.bucketName,
            region: region,
            tableName: `${resourcePrefix}-${apiVersion}-session`
        },
        reservedConcurrentExecutions: 3,
    });

    // get the dynamo table
    const sessionsTable = Table.fromTableName(
        scope,
        `${resourcePrefix}-${apiVersion}-table`,
        `${resourcePrefix}-${apiVersion}-session`
    );

    const lambdaFunctionFilter = new NodejsFunction(
        scope,
        `${resourcePrefix}-${apiVersion}-logging`,
        {
            entry: path.join(__dirname, "..", "..", "lambdas", "logging.ts"),
            depsLockFilePath: path.join(__dirname, "..", "..", "package-lock.json"),
            environment: {
                inputBucket: inputBucket.bucketName,
                outputBucket: outputBucket.bucketName,
                region: region,
                tableName: `${resourcePrefix}-${apiVersion}-session`,
            },
            runtime: Runtime.NODEJS_20_X,
            timeout: Duration.minutes(15),
            reservedConcurrentExecutions: 3,
        }
    );

    // Allow lambda to write to dynamodb
    sessionsTable.grantReadWriteData(lambdaFunctionFilter);
    sessionsTable.grantReadWriteData(lambdaFunctionCheck);

    new SubscriptionFilter(scope, `${resourcePrefix}-${apiVersion}-sub-filter`, {
        logGroup: lambdaFunctionCheck.logGroup,
        destination: new LambdaDestination(lambdaFunctionFilter),
        filterPattern: FilterPattern.literal('Project Evaluation Session ID'),
    });

    // Attach the SQS event source to the Lambda function
    lambdaFunctionCheck.addEventSource(new SqsEventSource(queue, {
        batchSize: 1, // Process one message at a time
    }));

    // Configure the S3 bucket to send notifications to the SQS queue
    inputBucket.addEventNotification(EventType.OBJECT_CREATED_PUT, new SqsDestination(queue), {
        suffix: '.zip'
    });
    inputBucket.grantRead(lambdaFunctionCheck);
    outputBucket.grantWrite(lambdaFunctionCheck);

    // sessionsTable.grantReadWriteData(lambdaFunction);

    // Grant the Lambda function permissions to read from the queue
    queue.grantConsumeMessages(lambdaFunctionCheck);

    // Add necessary permissions for the Lambda function to be invoked by CloudWatch Logs
    lambdaFunctionFilter.addPermission('AllowCloudWatchInvoke', {
        principal: new ServicePrincipal('logs.amazonaws.com'),
        sourceArn: ruleCheckLogGroup.logGroupArn,
    });
};