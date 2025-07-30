import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { ApiVersion } from './enums/rct-version';

interface RctCdkResourceStackProps extends StackProps {
    applicationName: string
    deploymentEnv: string
}

interface VersionedRctCdkResourceStackProps extends StackProps {
    applicationName: string
    deploymentEnv: string
    apiVersion: ApiVersion;
}

export class RctResourceStack extends Stack {
    constructor(scope: Construct, id: string, props: RctCdkResourceStackProps) {
        super(scope, id, props);

        Object.values(ApiVersion).forEach((version) => {
            this.createVersionedApiResources({
                ...props,
                apiVersion: version,
            });
        });
    }

    private createVersionedApiResources(props: VersionedRctCdkResourceStackProps) {
        const { applicationName, deploymentEnv, apiVersion } = props;

        const inputBucket = new Bucket(this, `${applicationName}-${deploymentEnv}-${apiVersion}-input-bucket`, {
            encryption: BucketEncryption.KMS_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.RETAIN
        });

        new CfnOutput(this, `${applicationName}-${deploymentEnv}-${apiVersion}-input-bucket-output`,
            {
                value: inputBucket.bucketName,
                exportName: `${applicationName}-${deploymentEnv}-${apiVersion}-input-bucket-export`
            }
        );

        // Create an output S3 bucket
        const outputBucket = new Bucket(this, `${applicationName}-${deploymentEnv}-${apiVersion}-output-bucket`, {
            encryption: BucketEncryption.KMS_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            removalPolicy: RemovalPolicy.RETAIN
        });

        new CfnOutput(this, `${applicationName}-${deploymentEnv}-${apiVersion}-output-bucket-output`,
            {
                value: outputBucket.bucketName,
                exportName: `${applicationName}-${deploymentEnv}-${apiVersion}-output-bucket-export`
            }
        );

        //Create a Dynamo Table
        //Create dynamoDB
        new Table(this, `${applicationName}-${deploymentEnv}-${apiVersion}-session`, {
            partitionKey: {
                name: 'sessionId',
                type: AttributeType.STRING
            },
            tableName: `${applicationName}-${deploymentEnv}-${apiVersion}-session`,

            /**
            *  The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
            * the new table, and it will remain in your account until manually deleted. By setting the policy to
            * DESTROY, cdk destroy will delete the table (even if it has data in it)
            */
            removalPolicy: RemovalPolicy.DESTROY, // NOT recommended for production code
        });
    }
}