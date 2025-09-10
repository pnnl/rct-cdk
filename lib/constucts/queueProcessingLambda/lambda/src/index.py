import json
import boto3
import zipfile
import os
import logging
from rct229.web_application import run_project_evaluation
from rct229.utils.file import deserialize_rpd_file
from datetime import datetime
from enum import Enum

# Initialize logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Enum for status tracking
class STATUS(Enum):
    EVALUATING = "EVALUATING"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"

# Headers for the HTTP response
HEADERS = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

# Function to initialize AWS resources
def init_aws_resources():
    # Retrieve environment variables
    input_bucket = os.environ['inputBucket']
    output_bucket = os.environ['outputBucket']
    region = os.environ['region']
    table_name = os.environ['tableName']
    # Initialize AWS S3 client
    s3 = boto3.client('s3')
    # Initialize AWS DynamoDB resource
    dynamodb = boto3.resource('dynamodb', region_name=region)
    # Get the DynamoDB table
    table = dynamodb.Table(table_name)
    return s3, table, input_bucket, output_bucket

# Lambda handler function
def handler(event, context):
    # Initialize AWS resources
    s3, table, input_bucket, output_bucket = init_aws_resources()
    try:
        # Check if there are records in the event
        if 'Records' in event and len(event['Records']) > 0:
            message = event['Records'][0]
            # Process the message
            process_message(message, s3, table, input_bucket, output_bucket)
            logger.info("Evaluation complete!")
            # Return a successful response
            return {
                'statusCode': 200,
                'headers': HEADERS,
                'body': json.dumps({"message": "Evaluation complete!"})
            }
        else:
            # No messages to process
            logger.info("No messages to process")
            return {
                'statusCode': 200,
                'headers': HEADERS,
                'body': json.dumps({"message": "No messages to process"})
            }
    except Exception as error:
        # Log and return error response
        logger.error(f"Error processing message: {str(error)}")
        return {
            'statusCode': 500,
            'headers': HEADERS,
            'body': json.dumps({"message": "Error processing message", "error": str(error)})
        }

# Function to get report and ruleset from DynamoDB
def get_report_and_ruleset(session_id, table):
    try:
        # Fetch the item from DynamoDB based on sessionId
        response = table.get_item(Key={'sessionId': session_id})
        item = response.get('Item')

        if not item:
            # Item not found in the table
            logger.error(f"Item with {session_id} not found")
            raise Exception(f"Item with {session_id} not found")

        # Extract reports and ruleset attributes
        reports = item.get('reports')
        ruleset = item.get('ruleset')

        # Prepare the response
        result = {
            'reports': reports,
            'ruleset': ruleset
        }
        return result
    except Exception as error:
        logger.error(f"Error processing message: {str(error)}")
        raise

# Function to validate if JSON files exist
def validate_json_exists(rpd_paths: list):
    for rpd_path in rpd_paths:
        if not os.path.exists(rpd_path):
            # File does not exist
            filename = rpd_path.replace("/tmp/", "", 1)
            logger.error(f"{filename} does not exist!")
            raise Exception(f"{filename} does not exist!")

# Function to validate JSON files
def validate_json(rpd_paths: list):
    for rpd_path in rpd_paths:
        try:
            # Attempt to deserialize the JSON file
            deserialize_rpd_file(rpd_path)
        except:
            # File is not a valid JSON
            filename = rpd_path.replace("/tmp/", "", 1)
            logger.error(f"{filename} is not a valid JSON file")
            raise

# Function to log failure to DynamoDB
def log_failure(session_id, message, table):
    new_status_message = message
    new_date_updated = datetime.now().isoformat()
    try:
        # Update the item in the DynamoDB table
        response = table.update_item(
            Key={'sessionId': session_id},
            UpdateExpression='SET dateUpdated = :d, #status = :s, statusMessage = :e',
            ExpressionAttributeValues={
                ':d': new_date_updated,
                ':e': new_status_message,
                ':s': STATUS.FAILURE.value
            },
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ReturnValues="UPDATED_NEW"
        )
        return response
    except Exception as error:
        logger.error(f"Error processing message: {str(error)}")
        raise

# Function to process the message
def process_message(message, s3, table, input_bucket, output_bucket):
    try:
        logger.info(f"Processed message {message['body']}")

        # Parse the message body
        dict_data = json.loads(message['body'])

        logger.info(dict_data)

        # Get the S3 key for the zip file
        zip_key = dict_data['Records'][0]['s3']['object']['key']

        # Check if the file is a zip file
        if not zip_key.endswith('.zip'):
            logger.info('File is not a zip.')
            raise Exception('File is not a zip.')

        # Extract session ID from the zip file name
        session_id = zip_key.replace(".zip", "")

        # Define the path for the downloaded zip file
        zip_path = f"/tmp/{zip_key}"

        # Download zip file from S3
        s3.download_file(input_bucket, zip_key, zip_path)

        # Unzip the file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall('/tmp/')

        # Find all .json and .rpd files in /tmp
        rpd_files = []
        for root, _, files in os.walk('/tmp'):
            for file in files:
                if file.endswith(('.json', '.rpd')) and "__MACOSX" not in root:
                    file_path = os.path.join(root, file)
                    rpd_files.append(file_path)

        # Validate and deserialize all RPD files
        rpds = []
        for rpd_path in rpd_files:
            # Validate JSON format
            validate_json([rpd_path])
            # Deserialize RPD file
            rpd = deserialize_rpd_file(rpd_path)
            rpds.append(rpd)

        # Get the report and ruleset from DynamoDB
        result_and_ruleset = get_report_and_ruleset(session_id, table)
        reports = result_and_ruleset.get('reports')
        ruleset = result_and_ruleset.get('ruleset')

        saving_dir = "/tmp/reports"
        os.makedirs(saving_dir, exist_ok=True)

        # Run the project evaluation
        run_project_evaluation(rpds, ruleset, reports, saving_dir=saving_dir, session_id=session_id)

        # Collect report files to be zipped
        report_files = []
        for root, _, files in os.walk(saving_dir):
            for file in files:
                file_path = os.path.join(root, file)
                report_files.append(file_path)

        # Check if there are report files to zip
        if not report_files:
            logger.error("Evaluation reports do not exist!")
            raise Exception("Evaluation reports do not exist!")

        # Create a new zip file with the report files
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for file_path in report_files:
                zipf.write(file_path, os.path.basename(file_path))

        # Upload the new zip file to S3
        s3.upload_file(zip_path, output_bucket, f"{session_id}.zip")

        # Log success message
        logger.info(f"{session_id}.zip written to S3")
    except Exception as error:
        # Log failure and raise the error
        log_failure(session_id, str(error), table)
        logger.error(f"Error processing message: {str(error)}")
        raise