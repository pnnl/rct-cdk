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
        return { statusCode: 400, body: `Error: You are missing the path parameter id` };
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
        return {statusCode: 200, body: JSON.stringify(response.Item.statusMessage)};
    } else {
        return {statusCode: 404, body: `Error: Invalid id - no such record`};
    }
   } catch (dbError) {
    return {statusCode: 500, body: JSON.stringify(dbError)};
   }
}