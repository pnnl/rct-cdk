import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

const TABLE_NAME = process.env.TABLE_NAME || '';
const PRIMARY_KEY = process.env.PRIMARY_KEY || '';

const db = DynamoDBDocument.from(new DynamoDB())

/**
 * This handler retrieves the status message based on session ID.
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
            body: JSON.stringify({message: "Error: You are missing the session ID id"})};
    }

    const params = {
        TableName: TABLE_NAME,
        Key: {
            [PRIMARY_KEY]: requestedSessionId
        }
    };

   try  {
    const response = await db.get(params);
    if (response.Item) {
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }, 
            body: JSON.stringify({message: response.Item.statusMessage})};
    } else {
        return {
            statusCode: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }, 
            body: JSON.stringify({message: `Error: Invalid id - no such record`})};
    }
   } catch (dbError) {
    return {statusCode: 500, 
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({message: dbError})};
   }
}