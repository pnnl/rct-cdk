import boto3
import json
import sys
from datetime import datetime
from io import StringIO
from rct229.web_application import run_project_evaluation as run
from rct229.utils.file import deserialize_rpd_file

# Initialize the DynamoDB client
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('ProgressTracking')

class DynamoDBLogger:
    def __init__(self, run_id):
        self.run_id = run_id
        self.old_stdout = sys.stdout
        sys.stdout = self
        self.log_buffer = StringIO()

    def write(self, message):
        if message.strip():  # Avoid logging empty messages
            self.log_to_dynamodb(message.strip())
            self.old_stdout.write(message)
            self.log_buffer.write(message)

    def log_to_dynamodb(self, message):
        timestamp = datetime.utcnow().isoformat()
        table.update_item(
            Key={'RunId': self.run_id},
            UpdateExpression='SET ProgressMessages = list_append(ProgressMessages, :i)',
            ExpressionAttributeValues={':i': [{'Timestamp': timestamp, 'Message': message}]}
        )

    def flush(self):
        self.old_stdout.flush()

    def close(self):
        sys.stdout = self.old_stdout

def lambda_handler(event, context):
    run_id = event['run_id']
    
    # Initialize progress tracking
    table.put_item(
        Item={
            'RunId': run_id,
            'ProgressMessages': []
        }
    )

    # Redirect stdout to our custom logger
    logger = DynamoDBLogger(run_id)
    try:
        user_rpd_path = "../examples/chicago_demo/user_model.json"
        proposed_rpd_path = "../examples/chicago_demo/proposed_model.json"
        baseline_rpd_path = "../examples/chicago_demo/baseline_model.json"

        user_rpd = None
        proposed_rpd = None
        baseline_rpd = None

        try:
            user_rpd = deserialize_rpd_file(user_rpd_path)
        except:
            print(f"{user_rpd_path} is not a valid JSON file")

        try:
            proposed_rpd = deserialize_rpd_file(proposed_rpd_path)
        except:
            print(f"{proposed_rpd_path} is not a valid JSON file")

        try:
            baseline_rpd = deserialize_rpd_file(baseline_rpd_path)
        except:
            print(f"{baseline_rpd_path} is not a valid JSON file")

        run([user_rpd, proposed_rpd, baseline_rpd], "ashrae9012019", ["ASHRAE9012019DetailReport"], saving_dir="./")
    finally:
        logger.close()

    return {
        'statusCode': 200,
        'body': json.dumps('Processing completed successfully')
    }

# Test event example
if __name__ == "__main__":
    test_event = {
        'run_id': 'test_run_123'
    }
    lambda_handler(test_event, None)
