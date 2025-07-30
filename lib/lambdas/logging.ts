// Import required modules
const zlib = require('zlib');
import { DynamoDBClient, UpdateItemCommand, ReturnValue } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { Status } from "../enums/status";

// Retrieve environment variables
const {
  region,
  tableName,
  outputBucket
} = process.env;

// Initialize DynamoDB client with the specified region
const client = new DynamoDBClient({ region: region });

// Function to log progress to DynamoDB
const logProgress = async (sessionId: string, percentComplete: string) => {
    // Prepare status message and timestamp
    const newStatusMessage = percentComplete;
    const newDateUpdated = new Date().toISOString();

    // Define default update expression parameters
    let expressionParams: any = {
      UpdateExpression: "SET dateUpdated = :d, statusMessage = :o",
      ExpressionAttributeValues: marshall({
          ":d": newDateUpdated,
          ":o": newStatusMessage
      })
    };

    // If the percentComplete indicates completion, update the status and output path as well
    if (percentComplete.includes('100%')) {
      expressionParams = {
        UpdateExpression: "SET dateUpdated = :d, statusMessage = :o, #status = :e, outputPath = :s",
        ExpressionAttributeValues: marshall({
            ":d": newDateUpdated,
            ":o": newStatusMessage,
            ":e": Status.SUCCESS,
            ":s": `s3://${outputBucket}/${sessionId}.zip`
        }),
        ExpressionAttributeNames: {
          "#status": "status"
        }
      };
    }

    // Prepare the parameters for the UpdateItemCommand
    const params = {
        TableName: tableName,
        Key: marshall({ sessionId }),
        ...expressionParams,
        ReturnValues: ReturnValue.UPDATED_NEW
    };

    // Execute the update command
    try {
        const command = new UpdateItemCommand(params);
        await client.send(command);
        console.log(`Updated status message for item with session id: ${sessionId}`);
    } catch (error: any) {
        console.log(`Failed to update status for item with session id: ${sessionId}`);
        if (error instanceof Error) {
          console.error("Error message: ", error.message);
      } else {
          console.error("Unknown error: ", error);
      }
    }
}

// Lambda handler function
export const handler = async (event: any = {}): Promise<any> => {
    // Decode and unzip the CloudWatch log data
    const payload = Buffer.from(event.awslogs.data, 'base64');
    const logData = zlib.gunzipSync(payload).toString('utf8');
    // Parse the log data into JSON
    const parsedLogData = JSON.parse(logData);
    const { logEvents } = parsedLogData;
  
    console.log("Printing complete Log data: ");
    console.log(parsedLogData);
  
    // Extract the latest log event
    const logMessageObj = logEvents.pop();
    if (!logMessageObj) {
      console.error("No log messages found");
      return;
    }
  
    const logMessage = logMessageObj.message;
  
    console.log("Printing Latest Log Message: ");
    console.log(logMessage);
  
    // Define the regular expression to capture session ID and percent complete
    const regex = /Project Evaluation Session ID: #([a-f0-9\-]+)# => (.*)/;
  
    // Use the regex to match the log message
    const match = logMessage.match(regex);
  
    // If there is a match, extract the session ID and percent complete
    if (match) {
      const sessionId = match[1];
      const percentComplete = match[2];
  
      console.log('Session ID:', sessionId);
      console.log(percentComplete);

      // Log the progress to DynamoDB
      await logProgress(sessionId, percentComplete)

    } else {
      console.log('No match found.');
    }
};