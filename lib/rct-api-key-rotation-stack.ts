import { StackProps, Duration } from "aws-cdk-lib";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Schedule, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { join } from "path";

export interface RCTStackProps extends StackProps {
  applicationName: string;
  deploymentEnv: string;
}

export class RctApiKeyRotationStack extends Stack {
  constructor(scope: Construct, id: string, props: RCTStackProps) {
    super(scope, id, props);

    const { applicationName, deploymentEnv } = props;

    const topic = new Topic(this, `${applicationName}-${deploymentEnv}-api-key-rotation-topic`);

    const emailList = [
        'julian.slane-holloway@pnnl.gov',
        'weili.xu@pnnl.gov'
    ];
    for (const email of emailList) {
        topic.addSubscription(new EmailSubscription(email));
    }

    const vpc = Vpc.fromLookup(
      this,
      `${applicationName}-${deploymentEnv}-ec2`,
      { vpcId: "vpc-00ff3e7b236c5f892" }
    );

    const subnets = vpc.selectSubnets({
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
    }).subnets;

    const nodeJsFunctionProps: NodejsFunctionProps = {
      depsLockFilePath: join(__dirname, "package-lock.json"),
      environment: {
        APPLICATION_NAME: applicationName,
        DEPLOYMENT_ENV: deploymentEnv,
        SNS_TOPIC_ARN: topic.topicArn,
        SUBNET_IDS: subnets.map((sub) => sub.subnetId).join(","),
      },
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
    };

    const rotateApiKeyLambda = new NodejsFunction(this, `${applicationName}-${deploymentEnv}-rotateApiKey`, {
      entry: join(__dirname, "lambdas", "api-key-rotation", "rotate-api-key.ts"),
      ...nodeJsFunctionProps,
    });

    rotateApiKeyLambda.addToRolePolicy(new PolicyStatement({
      actions: [
        'apigateway:GET',
        'apigateway:POST',
        'apigateway:DELETE',
        'apigateway:PATCH',
        'ssm:GetParameter',
        'ssm:PutParameter',
      ],
      resources: ['*'],
    }));

    new Rule(this, `${applicationName}-${deploymentEnv}-api-key-rotation-trigger`, {
      schedule: Schedule.rate(Duration.days(1)),
      targets: [new LambdaFunction(rotateApiKeyLambda)],
    });

    topic.grantPublish(rotateApiKeyLambda);
  }
}
