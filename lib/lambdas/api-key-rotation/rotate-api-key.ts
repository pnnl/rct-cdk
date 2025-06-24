import { APIGateway, SNS } from 'aws-sdk';
import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';

const apiGateway = new APIGateway();
const sns = new SNS();
const ssm = new SSMClient();

exports.handler = async () => {
  const applicationName = process.env.APPLICATION_NAME || '';
  const deploymentEnv = process.env.DEPLOYMENT_ENV || '';
  const topicArn = process.env.SNS_TOPIC_ARN || '';

  const usagePlanIdParam = await ssm.send(new GetParameterCommand({
    Name: `${applicationName}-${deploymentEnv}-usage-plan-id`,
  }));
  const usagePlanId = usagePlanIdParam.Parameter?.Value!;

  const apiKeyIdParam = await ssm.send(new GetParameterCommand({
    Name: `${applicationName}-${deploymentEnv}-api-key-id`,
  }));
  const existingApiKeyId = apiKeyIdParam.Parameter?.Value!

  console.log(`Usage Plan ID: ${usagePlanId}`);
  console.log(`Existing API Key ID: ${existingApiKeyId}`);
  console.log(`${applicationName}-${deploymentEnv}-api-key-id`)


  const apiKey = await apiGateway.getApiKey({
    apiKey: existingApiKeyId,
    includeValue: true,
  }).promise();

  const createdDate = new Date(apiKey.createdDate!);
  const ageInDays = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

  const expirationDuration = 180;

  if (ageInDays >= expirationDuration) {
    const newKey = await apiGateway.createApiKey({
      name: `${applicationName}-${deploymentEnv}-api-key`,
      enabled: true,
      generateDistinctId: true,
    }).promise();

    await apiGateway.createUsagePlanKey({
      usagePlanId: usagePlanId,
      keyId: newKey.id!,
      keyType: 'API_KEY',
    }).promise();

    await ssm.send(new PutParameterCommand({
      Name: `${applicationName}-${deploymentEnv}-api-key-id`,
      Value: newKey.id!,
      Overwrite: true,
    }));

    await sns.publish({
      TopicArn: topicArn,
      Subject: 'RCT API Key Rotated',
      Message: `Rotated API key (${apiKey.name}) after ${ageInDays} days.\nNew key ID: ${newKey.id}`,
    }).promise();

    await apiGateway.deleteApiKey({ apiKey: existingApiKeyId }).promise();
  } else if (ageInDays >= (expirationDuration - 1)) {
    await sns.publish({
      TopicArn: topicArn,
      Subject: 'RCT API Key Rotation - 1 Day Warning',
      Message: `The API key (${apiKey.name}) is ${expirationDuration - 1} days old and will be rotated tomorrow.`,
    }).promise();
  } else if (ageInDays >= (expirationDuration - 7)) {
    await sns.publish({
      TopicArn: topicArn,
      Subject: 'RCT API Key Rotation - 1 Week Warning',
      Message: `The API key (${apiKey.name}) is ${expirationDuration - 7} days old and will be rotated in 7 days.`,
    }).promise();
  } else {
    console.log(`API key is ${ageInDays} days old. No action needed.`);
  }
};
