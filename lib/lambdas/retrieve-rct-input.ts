
import { S3Client, GetObjectCommand, GetObjectCommandInput } from '@aws-sdk/client-s3'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const INPUT_BUCKET_KEY = process.env.INPUT_BUCKET_KEY || '';
const TABLE_NAME = process.env.TABLE_NAME || '';
const s3Client = new S3Client();

const db = DynamoDBDocument.from(new DynamoDB())
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

    const table_params = {
        TableName: TABLE_NAME,
        Key: {
            "sessionId": requestedSessionId
        }
    };

    try {
        const response = await db.get(table_params);
        if (response.Item && response.Item.status != "SUCCESS") {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ message: `Error: File not found - status is ${response.Item.status}` })
            };
        } else if (!response.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ message: `Error: Invalid id - no such record` })
            };
        }
    } catch (dbError) {
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ message: dbError })
        };
    }

    //S3 getObject param
    const params: GetObjectCommandInput = {
        Bucket: INPUT_BUCKET_KEY,
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
            body: JSON.stringify({ message: 'RPD input file(s) not found' })
        };
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