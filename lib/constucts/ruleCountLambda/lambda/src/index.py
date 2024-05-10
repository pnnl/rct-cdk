from rct229.web_application import count_number_of_rules as count_rules
from rct229.utils.assertions import RCTFailureException
import json

def handler(event, context):
    ruleset = event.get('queryStringParameters', {}).get('ruleset', None)

    if ruleset is None:
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'invalid request, missing ruleset.'})
        }
    num_rules = 0

    try:
        num_rules = count_rules()
    except RCTFailureException as e:
        return {
            'statusCode': 400,
            'body': json.dumps({'message':e})
        }

    return {
        'statusCode': 200,
        'body': json.dumps({'num_rules': num_rules})
    }
