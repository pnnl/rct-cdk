import { Duration, Fn } from 'aws-cdk-lib';
import { Bucket, EventType } from 'aws-cdk-lib/aws-s3';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Function, Runtime, Code, Handler } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { SqsDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import path = require('path');

interface QueueProcessingLambdaProps {
    applicationName: string
    deploymentEnv: string
}

export const QueueProcessingLambda = (scope: Construct, props: QueueProcessingLambdaProps) => {

    const { applicationName, deploymentEnv } = props;

    const inputBucketName = Fn.importValue(`${applicationName}-${deploymentEnv}-input-bucket-export`);
    const outputBucketName = Fn.importValue(`${applicationName}-${deploymentEnv}-output-bucket-export`);

    const inputBucket = Bucket.fromBucketName(scope, `${applicationName}-${deploymentEnv}-input-bucket`, inputBucketName);
    const outputBucket = Bucket.fromBucketName(scope, `${applicationName}-${deploymentEnv}-output-bucket`, outputBucketName);

    // Create an SQS dead letter queue
    const dlqueue = new Queue(scope, `${applicationName}-${deploymentEnv}-dl-queue`, {});

    // Create an SQS queue
    const queue = new Queue(scope, `${applicationName}-${deploymentEnv}-queue`, {
        visibilityTimeout: Duration.seconds(900),
        deadLetterQueue: {
            queue: dlqueue,
            maxReceiveCount: 5
        }
    });

    // Create a Lambda function
    const lambdaFunction = new Function(scope, `${applicationName}-${deploymentEnv}-lambda`, {
        runtime: Runtime.FROM_IMAGE,
        handler: Handler.FROM_IMAGE,
        code: Code.fromAssetImage(path.join(__dirname, 'lambda')),
        timeout: Duration.minutes(15),
        memorySize: 1024,
        environment: {
            inputBucket: inputBucket.bucketName,
            outputBucket: outputBucket.bucketName
        }
    });

    // Attach the SQS event source to the Lambda function
    lambdaFunction.addEventSource(new SqsEventSource(queue, {
        batchSize: 1, // Adjust based on your use case
    }));

    // Configure the S3 bucket to send notifications to the SQS queue
    inputBucket.addEventNotification(EventType.OBJECT_CREATED_PUT, new SqsDestination(queue), {
        suffix: '.zip'
    });
    inputBucket.grantRead(lambdaFunction);
    outputBucket.grantWrite(lambdaFunction);

    // Grant the Lambda function permissions to read from the queue
    queue.grantConsumeMessages(lambdaFunction);
};