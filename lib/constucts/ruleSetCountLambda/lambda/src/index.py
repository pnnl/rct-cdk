from rct229.web_application import get_available_rulesets as get_rulesets
import json


def handler(event, context):
    rulesets = get_rulesets()
    num_rulesets = len(rulesets)
    return {
        'statusCode': 200,
        'body': json.dumps({'num_rulesets': num_rulesets, 'rulesets': rulesets})
    }
