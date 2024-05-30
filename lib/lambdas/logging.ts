const zlib = require('zlib');
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
    const regex = /Project Evaluation Session ID: #([a-f0-9\-]+)# => Compliance evaluation progress: (\d+)%/;
  
    // Use the regex to match the log message
    const match = logMessage.match(regex);
  
    if (match) {
      const sessionId = match[1];
      const percentComplete = match[2];
  
      console.log('Session ID:', sessionId);
      console.log('Percent Complete:', percentComplete);
    } else {
      console.log('No match found.');
    }
};
