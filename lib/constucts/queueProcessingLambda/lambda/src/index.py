import json
import boto3
import zipfile
import os
from rct229.web_application import run_project_evaluation as run
from rct229.utils.file import deserialize_rpd_file
from botocore.exceptions import ClientError
from datetime import datetime, timezone

s3 = boto3.client('s3')

inputBucket = os.environ['inputBucket']
outputBucket = os.environ['outputBucket']
region = 'us-west-2'
table_name = 'rct-juan-dev-session'
dynamodb = boto3.resource('dynamodb', region_name=region)
table = dynamodb.Table(table_name)

headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

def handler(event, context):
    for message in event['Records']:
        process_message(message)
    print("done")

def validate_json_exists(user_rpd_path, proposed_rpd_path, baseline_rpd_path):
    # Check if files exist
    if not os.path.exists(user_rpd_path):
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps('User RPD file does not exist!')
        }
    if not os.path.exists(proposed_rpd_path):
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps('Proposed RPD file does not exist!')
        }
    if not os.path.exists(baseline_rpd_path):
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps('Baseline RPD file does not exist!')
        }
    
def validate_json(user_rpd_path, proposed_rpd_path, baseline_rpd_path):
    try:
        deserialize_rpd_file(user_rpd_path)
    except:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps(f"{user_rpd_path} is not a valid JSON file")
        }

    try:
        deserialize_rpd_file(proposed_rpd_path)
    except:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps(f"{proposed_rpd_path} is not a valid JSON file")
        }
        
    try:
        deserialize_rpd_file(baseline_rpd_path)
    except:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps(f"{baseline_rpd_path} is not a valid JSON file")
        }

def updateItem(sessionId):

    # Generate the current UTC time
    current_time = datetime.now(timezone.utc)

    # Format the time as an ISO 8601 string with milliseconds and a 'Z' to indicate UTC
    timestamp = current_time.isoformat(timespec='milliseconds').replace('+00:00', 'Z')

    # Define the key of the item to update
    key = {
        'sessionId':  sessionId
    }

    # Define the update expression, condition expression, and attribute values
    update_expression = "SET #attr1 = :val1, #attr2 = :val2"
    expression_attribute_names = {
        '#attr1': 'dateUpdated',  # Replace with your attribute names
        '#attr2': 'outputPath'
    }
    expression_attribute_values = {
        ':val1': timestamp,  # Replace with your new values
        ':val2': f"s3://{inputBucket}/{sessionId}/ashrae901_2019_detail_report.json"
    }

    # Perform the update
    try:
        response = table.update_item(
            Key=key,
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues="UPDATED_NEW"  # Optionally return the updated values
        )
        print("Item updated successfully:", response)
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            print("Condition check failed:", e.response['Error']['Message'])
        else:
            print("Error updating item:", e.response['Error']['Message'])

def process_message(message):
    try:
        print(f"Processed message {message['body']}")

        dict_data = json.loads(message['body'])

        print(dict_data)

        # Get bucket and file details from the event
        # bucket = dict_data['Records'][0]['s3']['bucket']['name']
        zip_key = dict_data['Records'][0]['s3']['object']['key']

        # print(f"Bucket: {bucket}")
        print(f"Key: {zip_key}")

        if not zip_key.endswith('.zip'):
            return {
                'statusCode': 500,
                'body': json.dumps('File is not a zip.')
            }

        session_id = zip_key.replace(".zip", "")

        # Download zip file from S3
        s3.download_file(inputBucket, zip_key, f"/tmp/{zip_key}")

        # Unzip the file
        with zipfile.ZipFile(f"/tmp/{zip_key}", 'r') as zip_ref:
            zip_ref.extractall('/tmp/')

        # Define file paths
        user_rpd_path = "/tmp/user_model.json"
        proposed_rpd_path = "/tmp/proposed_model.json"
        baseline_rpd_path = "/tmp/baseline_model.json"

        validate_json_exists(user_rpd_path, proposed_rpd_path, baseline_rpd_path)

        validate_json(user_rpd_path, proposed_rpd_path, baseline_rpd_path)

        # Deserialize rpd files
        user_rpd = deserialize_rpd_file(user_rpd_path)
        proposed_rpd = deserialize_rpd_file(proposed_rpd_path)
        baseline_rpd = deserialize_rpd_file(baseline_rpd_path)

        run([user_rpd, proposed_rpd, baseline_rpd], "ashrae9012019", ["ASHRAE9012019DetailReport"], saving_dir="/tmp")

        if not os.path.exists(f"/tmp/ashrae901_2019_detail_report.json"):
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps('Ashrae file does not exist!')
            }
        
        s3.upload_file("/tmp/ashrae901_2019_detail_report.json", outputBucket, f"{session_id}/ashrae901_2019_detail_report.json")

        updateItem(session_id)

        print('DONE!')
    except Exception as err:
        print("An error occurred")
        raise err