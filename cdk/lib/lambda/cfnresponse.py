# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

import json
import logging
import urllib.request

SUCCESS = "SUCCESS"
FAILED = "FAILED"

def send(event, context, response_status, response_data, physical_resource_id=None, no_echo=False):
    response_url = event.get('ResponseURL')

    if not response_url:
        logging.warning("No ResponseURL found in event, assuming local testing or direct Lambda invocation")
        return

    response_body = {
        'Status': response_status,
        'Reason': f"See the details in CloudWatch Log Stream: {context.log_stream_name}",
        'PhysicalResourceId': physical_resource_id or context.log_stream_name,
        'StackId': event.get('StackId'),
        'RequestId': event.get('RequestId'),
        'LogicalResourceId': event.get('LogicalResourceId'),
        'NoEcho': no_echo,
        'Data': response_data
    }

    json_response_body = json.dumps(response_body)
    
    logging.info(f"Response body: {json_response_body}")

    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }

    try:
        req = urllib.request.Request(response_url, 
                                    data=json_response_body.encode('utf-8'),
                                    headers=headers,
                                    method='PUT')
        with urllib.request.urlopen(req) as response:
            logging.info(f"Status code: {response.status}")
            logging.info(f"Status message: {response.reason}")
    except Exception as e:
        logging.error(f"send(..) failed executing urllib.request.urlopen(..): {e}")
        raise