from rct229.web_application import count_number_of_rules as count_rules
from rct229.utils.assertions import RCTFailureException
import json

headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

def handler(event, context):
    ruleset = event.get('queryStringParameters', {}).get('ruleset', None)


    if ruleset is None:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps({'message': 'Invalid request, missing ruleset.'})
        }
    num_rules = 0

    try:
        num_rules = count_rules(ruleset)
    except RCTFailureException as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': str(e)})
        }
    except Exception:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'message': "Internal Error"})
        } 

    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({'num_rules': num_rules})
    }
