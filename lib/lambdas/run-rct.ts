import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import {S3Client, PutObjectCommand, PutObjectCommandInput} from '@aws-sdk/client-s3'


const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_KEY = process.env.BUCKET_KEY || '';
const ECS_CLUSTER_ARN = process.env.ECS_CLUSTER_ARN || '';
const SERVICE_NAME = process.env.SERVICE_NAME || '';
const TASK_DEFINITION_ARN = process.env.TASK_DEFINITION_ARN || '';
const SUBNET_IDS = process.env.SUBNET_IDS || '';

const s3Client = new S3Client();
const {ECS} = require("aws-sdk");

const db = DynamoDBDocument.from(new DynamoDB())
/**
 * This handler runs the ruleset checking tool evaluation
 * It does three things: 
 * 1. Save uploaded files to S3
 * 2. Add a record to dynamoDB
 * 3. Kick off a RCT calculation
 * @param event
 * @returns 
 */
export const handler = async (event: any = {}): Promise<any> => {
    if(!event || !event.body) {
        return {statusCode: 400, body: 'invalid request, missing requested json files'};
    }

    if(!event.queryStringParameters?.ruleset) {
        return {statusCode: 400, body: 'invalid request, missing ruleset.'};
    }

    const {v4: uuidv4} = require('uuid');
    const uploadedFiles = JSON.parse(event.body);
    const ruleset = event.queryStringParameters.ruleset;

    //1. generate a new session ID
    const sessionId = uuidv4();
    const jobId = uuidv4();
    
    //2. upload files to S3
    for (const rpd of uploadedFiles) {
        // const {rpdName, rpdContext} = rpd;
        const rpdName = 'test'
        const rpdContext = rpd
        const uploadParams: PutObjectCommandInput = {
            Bucket: BUCKET_KEY,
            Key: `${sessionId}/${rpdName}`,
            Body: JSON.stringify(rpdContext),
            ContentType: 'application/json'
        }
        await s3Client.send(new PutObjectCommand(uploadParams))
    }

    //3. Send the job.
    const ecs = new ECS();
    await ecs.runTask({
        cluster: ECS_CLUSTER_ARN,
        taskDefinition: TASK_DEFINITION_ARN,
        count: 10,
        launchType: "FARGATE",
        networkConfiguration: {
         awsvpcConfiguration: {
            subnets: SUBNET_IDS.split(",")
         }   
        }
    }).promise();
    
    // 4. write to the dynamo db
    await db.put({
        TableName: TABLE_NAME,
        Item: {
            sessionId: sessionId,
            jobId: jobId,
            type: 'Evaluation',
            statusMessage: 'Preparing the evaluation'
        }
    })

    //5. return session id
    return {
        statusCode: 200,
        body: JSON.stringify({
            sessionId: sessionId,
            service_name: SERVICE_NAME
        })
    };
}