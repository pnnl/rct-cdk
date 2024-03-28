import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import {S3Client, PutObjectCommand, PutObjectCommandInput} from '@aws-sdk/client-s3'


const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_KEY = process.env.BUCKET_KEY || '';
const s3Client = new S3Client();

const db = DynamoDBDocument.from(new DynamoDB())

export const handler = async (event: any = {}): Promise<any> => {
    if(!event) {
        if(!event.body)
        {
            return {statusCode: 400, body: 'invalid request, missing requested json files'};
        }
        else if(!event.queryParameters.ruleset)
        {
            return {statusCode: 400, body: 'invalid request, missing ruleset.'};
        }
    }

    const {v4: uuidv4} = require('uuid');
    const uploadedFiles = JSON.parse(event.body);
    const ruleset = event.queryParameters.ruleset;

    //1. generate a new session ID
    const sessionId = uuidv4();
    const jobId = uuidv4();
    
    //2. upload files to S3
    for (const rpd of uploadedFiles) {
        const {rpdName, rpdContext} = rpd;
        const uploadParams: PutObjectCommandInput = {
            Bucket: BUCKET_KEY,
            Key: `${sessionId}/${rpdName}`,
            Body: rpdContext,
            ContentType: 'application/json'
        }
        await s3Client.send(new PutObjectCommand(uploadParams))
    }

    // 3. Send the job.

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
            sessionId: sessionId
        })
    };
}