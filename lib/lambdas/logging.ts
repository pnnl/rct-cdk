const zlib = require('zlib');
import { DynamoDBClient, UpdateItemCommand, ReturnValue } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const {
  region,
  tableName
} = process.env;

const client = new DynamoDBClient({ region: region });

const logProgress = async (sessionId: string, percentComplete: string) => {
    const newStatusMessage = percentComplete;
    const newDateUpdated = new Date().toISOString();

    const params = {
        TableName: tableName,
        Key: marshall({ sessionId }),
        UpdateExpression: "SET dateUpdated = :d, statusMessage = :o",
        ExpressionAttributeValues: marshall({
            ":d": newDateUpdated,
            ":o": newStatusMessage
        }),
        ReturnValues: ReturnValue.UPDATED_NEW
    };

    try {
        const command = new UpdateItemCommand(params);
        await client.send(command);
        console.log(`Updated status message for item with session id: ${sessionId}`);
    } catch (error) {
        console.log(`Failed to update status for item with session id: ${sessionId}`);
    }
}

export const handler = async (event: any = {}): Promise<any> => {
    const payload = Buffer.from(event.awslogs.data, 'base64');
    const logData = zlib.gunzipSync(payload).toString('utf8');
    const parsedLogData = JSON.parse(logData);
    const { logEvents } = parsedLogData;
  
    console.log("Printing complete Log data: ");
    console.log(parsedLogData);
  
    const logMessageObj = logEvents.pop();
    if (!logMessageObj) {
      console.error("No log messages found");
      return;
    }
  
    const logMessage = logMessageObj.message;
  
    console.log("Printing Latest Log Message: ");
    console.log(logMessage);
  
    // Define the regular expression to capture session ID and percent complete
    // const regex = /Project Evaluation Session ID: #([a-f0-9\-]+)# => Compliance evaluation progress: (\d+)%/;
    const regex = /Project Evaluation Session ID: #([a-f0-9\-]+)# => (.*)/;
  
    // Use the regex to match the log message
    const match = logMessage.match(regex);
  
    if (match) {
      const sessionId = match[1];
      const percentComplete = match[2];
  
      console.log('Session ID:', sessionId);
      console.log(percentComplete);

      await logProgress(sessionId, percentComplete)

    } else {
      console.log('No match found.');
    }
};