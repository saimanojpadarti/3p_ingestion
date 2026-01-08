import json
import boto3
import pandas as pd
import awswrangler as wr

datazone_client = boto3.client('datazone', region_name='us-west-2')
s3_client = boto3.client('s3')
sns_client = boto3.client('sns')

def handler(event, context):
    # TODO implement
    print(json.dumps(event))
    session = boto3.Session()
    account_id = session.client('sts').get_caller_identity()['Account']
    region = session.region_name
    incoming_data = {}
    result = {}
    if event["detail-type"] == 'Asset Added To Catalog':
        incoming_data['user_id'] = event['detail']['metadata'].get('user')
        incoming_data['asset_id'] = event['detail']['data'].get('assetId')
    elif event["detail-type"] == 'Metadata Generation Accepted':
        incoming_data['user_id'] = event['detail']['data'].get('userId')
        incoming_data['asset_id'] = event['detail']['metadata'].get('id')

    incoming_data['create_date'] = event['time']
    incoming_data['domain_id'] = event['detail']['metadata'].get('domain')
    incoming_data['project_id'] = event['detail']['metadata'].get('owningProjectId')
    incoming_data['project_name'], domain_unit_id = get_project_name_and_domain_unit(incoming_data['domain_id'], incoming_data['project_id'])
    incoming_data['domain_unit_name'] = get_domain_unit_name(incoming_data['domain_id'],domain_unit_id)
    incoming_data['domain_name'] = get_domain_name(incoming_data['domain_id'])
    incoming_data['asset_name'], incoming_data['asset_revision'], incoming_data['asset_summary'], result['columns_metadata'] = get_asset_data(incoming_data['domain_id'], incoming_data['asset_id'])
    columns_metadata = json.loads(result["columns_metadata"])
    df = pd.DataFrame(columns_metadata)
    df = df.rename(columns={'columnIdentifier':'column_name'})
    df = df[['column_name', 'description']]
    s3_path = f"s3://pnp-datazone-metadata-bucket-{account_id}-{region}/datazone-assets/{incoming_data['domain_name']}/{incoming_data['domain_unit_name']}/{incoming_data['project_name']}/{incoming_data['asset_name']}.csv"
    wr.s3.to_csv(df, path=s3_path, index=False)

    s3 = boto3.client('s3')
    url = s3.generate_presigned_url(
        ClientMethod='get_object',
        Params={
            'Bucket': s3_path.split('/')[2],
            'Key': '/'.join(s3_path.split('/')[3:])
        },
        ExpiresIn=86400
    )
    topic_arn = f"arn:aws:sns:{region}:{account_id}:pnp-slack-subscription"
    
    try:
        # Publish the message to the specified topic
        response = sns_client.publish(
            TopicArn=topic_arn,
            Message=url,
            Subject="datazone Asset Metadata Download Notification" # Optional subject for email notifications
        )
        print("Message published to SNS. Message ID:", response['MessageId'])
        return {
            'statusCode': 200,
            'body': json.dumps('Message published successfully!')
        }
        
    except Exception as e:
        print(f"Error publishing message: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f"Error publishing message: {e}")
        }


def get_asset_data(domain_id, asset_id):
    response = datazone_client.get_asset(
        domainIdentifier=domain_id,
        identifier=asset_id
    )
    common_details_content = json.loads([form_output['content'] for form_output in response['formsOutput'] if form_output['formName'] == 'AssetCommonDetailsForm'][0])
    column_business_metadata_content = json.loads([form_output['content'] for form_output in response['formsOutput'] if form_output['formName'] == 'ColumnBusinessMetadataForm'][0])
    columns_metadata = json.dumps(column_business_metadata_content['columnsBusinessMetadata'], indent=2)
    asset_name = response['name']
    asset_revision = response['revision']
    asset_summary = common_details_content['summary']
    return asset_name, asset_revision, asset_summary, columns_metadata

def get_domain_name(domain_id):
    response = datazone_client.get_domain(identifier = domain_id)
    return response['name']


def get_domain_unit_name(domain_id, domain_unit_identifier):
    response = datazone_client.get_domain_unit(
        domainIdentifier=domain_id,
        identifier=domain_unit_identifier
    )
    return response['name']


def get_project_name_and_domain_unit(domain_id, project_id):
    response = datazone_client.get_project(
        domainIdentifier=domain_id,
        identifier=project_id
    )
    project_name = response['name']
    domain_unit_identifier = response['domainUnitId']
    return project_name, domain_unit_identifier