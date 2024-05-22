from rct229.web_application import get_available_rulesets as get_rulesets
import json

headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

def handler(event, context):
    rulesets = get_rulesets()
    num_rulesets = len(rulesets)
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({'num_rulesets': num_rulesets, 'rulesets': rulesets})
    }
