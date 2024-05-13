from rct229.web_application import get_available_reports_by_ruleset as get_reports
from rct229.utils.assertions import RCTFailureException
import json


def handler(event, context):
    ruleset = event.get('queryStringParameters', {}).get('ruleset', None)

    if ruleset is None:
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'Invalid request, missing ruleset.'})
        }
    
    try:
        ruleset_reports = get_reports(ruleset)
    except RCTFailureException as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'message':e})
        }

    return {
        'statusCode': 200,
        'body': json.dumps({'num_reports': len(ruleset_reports), 'reports': ruleset_reports})
    }
