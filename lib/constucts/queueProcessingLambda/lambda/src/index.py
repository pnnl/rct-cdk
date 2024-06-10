import json
import boto3
import zipfile
import os
from rct229.web_application import run_project_evaluation as run
from rct229.utils.file import deserialize_rpd_file
from rct229.utils.assertions import assert_
from botocore.exceptions import ClientError
from datetime import datetime
from enum import Enum

s3 = boto3.client('s3')

inputBucket = os.environ['inputBucket']
outputBucket = os.environ['outputBucket']
region = os.environ['region']
table_name = os.environ['tableName']
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table(table_name)

class STATUS(Enum):
    EVALUATING = "EVALUATING"
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"

headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

def handler(event, context):
    for message in event['Records']:
        process_message(message)

def get_report_and_ruleset(session_id):
    try:
        # Fetch the item from DynamoDB based on sessionId
        response = table.get_item(Key={'sessionId': session_id})
        item = response.get('Item')

        if not item:
            print('SessionId not found')

        # Extract reports and ruleset attributes
        reports = item.get('reports')
        ruleset = item.get('ruleset')

        # Prepare the response
        result = {
            'reports': reports,
            'ruleset': ruleset
        }

        return result

    except ClientError as e:
        print(f"Error fetching item from DynamoDB: {e.response['Error']['Message']}")

def validate_json_exists(rpd_paths: list):
    # Check if files exist
    for rpd_path in rpd_paths:
        if not os.path.exists(rpd_path):
            filename = rpd_path.replace("/tmp/", "", 1)
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({"message": f"{filename} does not exist!"})
        }
    
def validate_json(rpd_paths: list):
    for rpd_path in rpd_paths:
        try:
            deserialize_rpd_file(rpd_path)
        except:
            filename = rpd_path.replace("/tmp/", "", 1)
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps(f"{filename} is not a valid JSON file")
            }

def log_failure(session_id, message):
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
                ':s': STATUS.FAILURE
            },
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ReturnValues="UPDATED_NEW"
        )
        return response
    except ClientError as e:
        print(f"Error updating item: {e.response['Error']['Message']}")
        return None

def process_message(message):
    try:
        print(f"Processed message {message['body']}")

        dict_data = json.loads(message['body'])

        print(dict_data)

        # Get bucket and file details from the event
        # bucket = dict_data['Records'][0]['s3']['bucket']['name']
        zip_key = dict_data['Records'][0]['s3']['object']['key']

        if not zip_key.endswith('.zip'):
            return {
                'statusCode': 500,
                'body': json.dumps('File is not a zip.')
            }

        session_id = zip_key.replace(".zip", "")

        zip_path = f"/tmp/{zip_key}"

        # Download zip file from S3
        s3.download_file(inputBucket, zip_key, zip_path)

        # Unzip the file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall('/tmp/')

        # Define file paths
        user_rpd_path = "/tmp/user_model.json"
        proposed_rpd_path = "/tmp/proposed_model.json"
        baseline_rpd_path = "/tmp/baseline_model.json"

        validate_json_exists([user_rpd_path, proposed_rpd_path, baseline_rpd_path])

        validate_json([user_rpd_path, proposed_rpd_path, baseline_rpd_path])

        # Deserialize rpd files
        user_rpd = deserialize_rpd_file(user_rpd_path)
        proposed_rpd = deserialize_rpd_file(proposed_rpd_path)
        baseline_rpd = deserialize_rpd_file(baseline_rpd_path)

        result_and_ruleset = get_report_and_ruleset(session_id)
        reports = result_and_ruleset.get('reports')
        ruleset = result_and_ruleset.get('ruleset')

        run([user_rpd, proposed_rpd, baseline_rpd], ruleset, reports, saving_dir="/tmp", session_id=session_id)

        excluded_paths = [
            user_rpd_path,
            proposed_rpd_path,
            baseline_rpd_path,
            zip_path
        ]

        report_files = []
        for root, _, files in os.walk('/tmp'):
            for file in files:
                file_path = os.path.join(root, file)
                if file_path not in excluded_paths:
                    report_files.append(file_path)

        if not report_files:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({"message": "Ashrae file does not exist!"})
            }

        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for file_path in report_files:
                zipf.write(file_path, os.path.relpath(file_path, '/tmp'))
        
        s3.upload_file(zip_path, outputBucket, f"{session_id}.zip")
    except Exception as err:
        print("An error occurred")
        # Method 1: Using str() function
        error_message = str(err)
        # Capture Error
        log_failure(session_id, error_message)
        raise err
    
    return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({ "message": "Evaluation complete!"})
        }