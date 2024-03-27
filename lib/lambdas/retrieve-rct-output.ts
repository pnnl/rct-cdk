
import {S3Client, PutObjectCommand, PutObjectCommandInput, GetObjectCommand, GetObjectCommandInput} from '@aws-sdk/client-s3'
import { Readable } from 'stream';

const BUCKET_KEY = process.env.BUCKET_KEY || '';
const s3Client = new S3Client();


export const handler = async (event: any = {}): Promise<any> => {
    const requestedSessionId = event.pathParameters.id;

    if (!requestedSessionId) {
        return { statusCode: 400, body: `Error: You are missing the path parameter id` };
    }

    //S3 getObject param
    const params: GetObjectCommandInput = {
        Bucket: BUCKET_KEY,
        Key: `${requestedSessionId}/output.json`, //replace the output file name.
    }
    try{

        // Get the output JSON file from S3
        const { Body } = await s3Client.send(new GetObjectCommand(params));
        if(!Body) {
            return {
                statusCode: 404,
                body: JSON.stringify({error: 'Output summary file not found'})
            }
        }

        // Convert the stream to a string
        const outputJsonStream = Body as Readable
        let outputJson = '';

        for await (const chunk of outputJsonStream) {
            outputJson += chunk;
        }
        return {
            statusCode: 200,
            body: outputJson
        } 
    } catch (s3Error) {
        return {
            statusCode: 500,
            body: JSON.stringify(s3Error)
        }
    }
}