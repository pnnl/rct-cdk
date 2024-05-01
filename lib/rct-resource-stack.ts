import * as cdk from 'aws-cdk-lib';
import { RCTStackProps } from './rct-cdk-stack'
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3'
import { AttributeType,  Table} from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as logs from 'aws-cdk-lib/aws-logs'

export class RctResourceStack extends cdk.Stack{
    constructor(scope: Construct, id: string, props?: RCTStackProps) {
        super(scope, id, props);

        //Create S3 Bucket
        new s3.Bucket(this, `${props?.appName}-${props?.deploymentEnv}-bucket`, {
            /**
            *  The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
            * the new table, and it will remain in your account until manually deleted. By setting the policy to
            * DESTROY, cdk destroy will delete the table (even if it has data in it)
            */
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            bucketName: `${props?.appName}-${props?.deploymentEnv}-bucket`
        })
        //Create a Dynamo Table
        //Create dynamoDB
       new Table(this, `${props?.appName}-${props?.deploymentEnv}-session`, {
            partitionKey: {
            name: 'sessionId',
            type: AttributeType.STRING
            },
            tableName: `${props?.appName}-${props?.deploymentEnv}-session`,
  
            /**
            *  The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
            * the new table, and it will remain in your account until manually deleted. By setting the policy to
            * DESTROY, cdk destroy will delete the table (even if it has data in it)
            */
            removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
        });

        //Create ECR for RCT image
        //Repo that stores the python image
        new ecr.Repository(this, 'ECRRepo', {
            repositoryName: `${props?.appName}-${props?.deploymentEnv}-package-repository`,
            lifecycleRules: [{maxImageCount: 5}] // no need to store lots of old images
        })

        //Create a log group
        new logs.LogGroup(this, `${props?.appName}-${props?.deploymentEnv}-log-group`, {
            logGroupName: `${props?.appName}-${props?.deploymentEnv}-log-group`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: logs.RetentionDays.ONE_WEEK // may need to update for production.
        })
    }
}