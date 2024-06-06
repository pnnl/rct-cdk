
import {S3Client, GetObjectCommand, GetObjectCommandInput} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const OUTPUT_BUCKET_KEY = process.env.OUTPUT_BUCKET_KEY || '';
const s3Client = new S3Client();

/**
 * This handler retrieves the report from S3 bucket by session ID.
 * @param event 
 * @returns 
 */
export const handler = async (event: any = {}): Promise<any> => {
    const requestedSessionId = event.pathParameters.id;

    if (!requestedSessionId) {
        return { 
            statusCode: 400, 
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }, 
            body: JSON.stringify({
                message: "Error: The request is missing the session ID"
            }) 
        };
    }

    //S3 getObject param
    const params: GetObjectCommandInput = {
        Bucket: OUTPUT_BUCKET_KEY,
        Key: `${requestedSessionId}.zip`, //replace the output file name.
    }

    const command = new GetObjectCommand(params);

    let signedUrl;

    try {
        signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL valid for 1 hour
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      return {
        statusCode: 404, 
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }, 
        body: JSON.stringify({message: 'Output summary file not found'})};
    }; 
    

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }, 
        body: JSON.stringify({ url: signedUrl }),
    };
}