import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import {S3Client, PutObjectCommand, PutObjectCommandInput} from '@aws-sdk/client-s3';
const {v4: uuidv4} = require('uuid');


const TABLE_NAME = process.env.TABLE_NAME || '';
const BUCKET_KEY = process.env.BUCKET_KEY || '';
const SERVICE_NAME = process.env.SERVICE_NAME || '';

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

    //TODO:
    // # Get the base64 encoded file content from the event
    // encoded_string = event['body'].encode('utf-8')

    // # Decode the file content
    // decoded_file = base64.b64decode(encoded_string)

    // # Create a BytesIO object
    // zip_file = io.BytesIO(decoded_file)

    // # Open the zip file
    // with zipfile.ZipFile(zip_file, 'r') as myzip:
    //     # Extract all the contents of zip file in current directory
    //     myzip.extractall('/tmp')  # Lambda has write access to /tmp

    const uploadedFiles = JSON.parse(event.body);
    const ruleset = event.queryStringParameters.ruleset;

    //1. generate a new session ID
    const sessionId = uuidv4();
    const jobId = uuidv4();
    
    //2. upload files to S3
    // Todo: move to after dynamodb write
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

    // //3. Send the job.
    // const ecs = new ECS();
    // await ecs.runTask({
    //     cluster: ECS_CLUSTER_ARN,
    //     taskDefinition: TASK_DEFINITION_ARN,
    //     count: 10,
    //     launchType: "FARGATE",
    //     networkConfiguration: {
    //      awsvpcConfiguration: {
    //         subnets: SUBNET_IDS.split(",")
    //      }   
    //     }
    // }).promise();
    
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
    // 4. write to the dynamo db
    await db.put({
        TableName: TABLE_NAME,
        Item: {
            sessionId: sessionId,
            jobId: jobId,
            type: 'Evaluation',
            statusMessage: 'Preparing the evaluation',
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