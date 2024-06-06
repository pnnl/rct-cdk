import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { Status } from '../status';
const {v4: uuidv4} = require('uuid');


const TABLE_NAME = process.env.TABLE_NAME || '';
const INPUT_BUCKET_KEY = process.env.INPUT_BUCKET_KEY || '';
const OUTPUT_BUCKET_KEY = process.env.INPUT_BUCKET_KEY || '';

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
        return {statusCode: 400, 
            headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
            }, 
            body: JSON.stringify({message: 'invalid request, missing requested zip file'})};
    }

    if(!event.queryStringParameters?.ruleset) {
        return {
            statusCode: 400, 
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }, 
            body: JSON.stringify({message:'invalid request, missing ruleset.'})};
    }

    if(!event.queryStringParameters?.reports) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }, 
            body: JSON.stringify({message:'invalid request, missing reports.'})};
    }

    const sessionId = uuidv4();

    // Write to dynamo db
    const ruleset = event.queryStringParameters.ruleset;
    const reportsQueryParam = event.queryStringParameters.reports;
    
    // Parse the reports string into a list
    let reports: string[];
    try {
        reports = JSON.parse(reportsQueryParam);
        if (!Array.isArray(reports)) {
            throw new Error('Reports should be a list');
        }
    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: `Invalid JSON format for reports: ${e.message}` }),
        };
    }
    await db.put({
        TableName: TABLE_NAME,
        Item: {
            sessionId: sessionId,
            type: 'Evaluation',
            dateCreated: new Date().toISOString(),
            dateUpdated: new Date().toISOString(),
            statusMessage: 'Preparing the evaluation',
            status: Status.EVALUATING,
            inputPath: `s3://${INPUT_BUCKET_KEY}/${sessionId}.zip`,
            outputPath: '',
            errors: '',
            ruleset: ruleset,
            reports: reports
        }
    })

    // Upload zip to S3 input bucket
    const fileData = Buffer.from(event.body, 'base64');

    const uploadParams: PutObjectCommandInput = {
        Bucket: INPUT_BUCKET_KEY,
        Key: `${sessionId}.zip`,
        Body: fileData,
        ContentType: "application/zip",
    }
    await s3Client.send(new PutObjectCommand(uploadParams))
    

    // Return session id
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }, 
        body: JSON.stringify({
            sessionId: sessionId,
        })
    };
}