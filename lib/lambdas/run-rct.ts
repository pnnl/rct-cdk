import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
const {v4: uuidv4} = require('uuid');


const TABLE_NAME = process.env.TABLE_NAME || '';
const INPUT_BUCKET_KEY = process.env.INPUT_BUCKET_KEY || '';

const s3Client = new S3Client();

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

    const sessionId = uuidv4();
    const jobId = uuidv4();

    // Upload zip to S3 input bucket
    const fileData = Buffer.from(event.body, 'base64');
    const fileKey = uuidv4();

    const uploadParams: PutObjectCommandInput = {
        Bucket: INPUT_BUCKET_KEY,
        Key: `${fileKey}.zip`,
        Body: fileData,
        ContentType: "application/zip",
    }
    await s3Client.send(new PutObjectCommand(uploadParams))
    
    // Entry Fields
    // PK: Entry UUID
    // SK: Datetime?
    // Entry ID
    // Date Created
    // Date Updated
    // Status
    // Input Path
    // Output path
    // Errors field
    // Ruleset
    // Reports

    // Write to dynamo db
    const ruleset = event.queryStringParameters.ruleset;
    const reports = event.queryStringParameters.reports;

    await db.put({
        TableName: TABLE_NAME,
        Item: {
            sessionId: sessionId,
            jobId: jobId,
            type: 'Evaluation',
            dateCreated: new Date().toISOString(),
            dateUpdated: new Date().toISOString(),
            statusMessage: 'Preparing the evaluation',
            inputPath: `${fileKey}.zip`,
            outputPath: '',
            errors: '',
            ruleset: ruleset,
            reports: reports
        }
    })

    // Return session id
    return {
        statusCode: 200,
        body: JSON.stringify({
            sessionId: sessionId,
        })
    };
}