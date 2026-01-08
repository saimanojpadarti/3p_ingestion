# lambda/datazone_policy_grant_handler.py
import json
import boto3
import logging
import cfnresponse
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Lambda handler for managing DataZone policy grants using a Custom Resource.
    """
    logger.info(f"Received event: {json.dumps(event)}")
    delay_seconds = 10  # Reduced delay for faster execution
    logger.info(f"Custom Resource Lambda starting, delaying for {delay_seconds} seconds to ensure readiness...")
    time.sleep(delay_seconds)

    request_type = event['RequestType']
    resource_properties = event['ResourceProperties']
    
    domain_id = resource_properties.get('DomainIdentifier')
    domain_unit_id = resource_properties.get('DomainUnitIdentifier')
    entity_id = resource_properties.get('EntityIdentifier')
    entity_type = resource_properties.get('EntityType')
    policy_type = resource_properties.get('PolicyType')
    principal_type = resource_properties.get('PrincipalType')
    principal_arn = resource_properties.get('PrincipalArn')
    # environment_blueprint_config_id = resource_properties.get('environment_blueprint_config_id')
    # environment_profile_id = resource_properties.get('environment_profile_id')
    project_id = resource_properties.get('project_id')
    include_child_domain_units = bool(resource_properties.get('IncludeChildDomainUnits', False))

    # physical_resource_id = f"{domain_id}-{entity_id}-{policy_type}-{principal_arn.replace(':', '-').replace('/', '-')}"

    response_data = {}
    status = cfnresponse.SUCCESS
    reason = "Success"

    try:
        # Initialize the DataZone client
        datazone_client = boto3.client('datazone')
        
        principal_detail = {}
        policy_detail = {}
        if (principal_type == 'IAM_USER' or principal_type == 'IAM_ROLE') and policy_type != 'CREATE_ENVIRONMENT_PROFILE':
            principal_detail['user'] = {'userIdentifier': principal_arn}
            # principal_detail['project'] = {'projectDesignation': 'OWNER'}
            # principal_detail['domainUnit'] = {'domainUnitDesignation' : 'OWNER', 'domainUnitIdentifier' : entity_id}
        elif principal_type == 'IAM_GROUP':
            principal_detail['group'] = {'groupIdentifier': principal_arn}
        elif principal_type == 'root':
            principal_detail['user'] = {'allUsersGrantFilter': {}}
        elif policy_type == 'CREATE_ENVIRONMENT_PROFILE':
            principal_detail['project'] = {
                'projectDesignation': 'OWNER',
                'projectGrantFilter': {
                    'domainUnitFilter': {
                        'domainUnit': domain_unit_id,
                        'includeChildDomainUnits': False
                    }
                },
                'projectIdentifier': project_id
            }
        elif policy_type == 'CREATE_ENVIRONMENT':
            principal_detail['project'] = {
                'projectDesignation': 'OWNER',
                'projectIdentifier': project_id
            }
        else:
            raise ValueError(f"Invalid PrincipalType: {principal_type}")

        if policy_type == 'CREATE_PROJECT':
            policy_detail['createProject'] = {'includeChildDomainUnits': include_child_domain_units}
        elif policy_type == 'ADD_TO_PROJECT_MEMBER_POOL':
            policy_detail['addToProjectMemberPool'] = {'includeChildDomainUnits': include_child_domain_units}
        elif policy_type == 'CREATE_GLOSSARY':
            policy_detail['createGlossary'] = {'includeChildDomainUnits': include_child_domain_units}
        elif policy_type == 'CREATE_FORM_TYPE':
            policy_detail['createFormType'] = {'includeChildDomainUnits': include_child_domain_units}
        elif policy_type == 'CREATE_ASSET_TYPE':
            policy_detail['createAssetType'] = {'includeChildDomainUnits': include_child_domain_units}
        elif policy_type == 'CREATE_ENVIRONMENT_PROFILE':
            policy_detail['createEnvironmentProfile'] = {'domainUnitId': domain_unit_id}
        elif policy_type == 'CREATE_ENVIRONMENT':
            policy_detail['createEnvironment'] = {}
        elif policy_type == 'CREATE_ENVIRONMENT_FROM_BLUEPRINT':
            policy_detail['createEnvironmentFromBlueprint'] = {'includeChildDomainUnits': include_child_domain_units}
        elif policy_type == 'CREATE_PROJECT_FROM_PROJECT_PROFILE':
            policy_detail['createProjectFromProjectProfile'] = {'includeChildDomainUnits': include_child_domain_units, 'projectProfiles': []}
        else:
            raise ValueError(f"Provided policy type doesn't exist: {policy_type}")

        if request_type == 'Create' or request_type == 'Update':
            logger.info(f"Attempting to AddPolicyGrant for {principal_arn} on {entity_type} {entity_id} with policy {policy_type}")
            
            # Add retry logic for API calls
            max_retries = 5  # Increased retries
            retry_delay = 5  # seconds
            
            for attempt in range(max_retries):
                try:
                    logger.info(f"domainIdentifier: {domain_id}, entityIdentifier: {entity_id}, entityType: {entity_type}, policyType: {policy_type}")
                    logger.info(f"principal: {principal_detail}, detail: {policy_detail}")
                    
                    
                    # Add the policy grant
                    datazone_client.add_policy_grant(
                        domainIdentifier=domain_id,
                        entityIdentifier= entity_id,
                        entityType=entity_type,
                        policyType=policy_type,
                        principal=principal_detail,
                        detail=policy_detail if policy_detail else None
                    )
                    logger.info("AddPolicyGrant successful.")
                    
                    response_data['Message'] = 'Policy grant added/updated successfully'
                    break
                except Exception as e:
                    if attempt < max_retries - 1:
                        logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    # else:
                    #     raise

        elif request_type == 'Delete':
            logger.info(f"Attempting to RemovePolicyGrant for {principal_arn} on {entity_type} {entity_id} with policy {policy_type}")
            
            # Add retry logic for API calls
            max_retries = 3
            retry_delay = 5  # seconds
            
            for attempt in range(max_retries):
                try:
                    datazone_client.remove_policy_grant(
                        domainIdentifier=domain_id,
                        entityIdentifier=entity_id,
                        entityType=entity_type,
                        policyType=policy_type,
                        principal=principal_detail
                    )
                    logger.info("RemovePolicyGrant successful.")
                    response_data['Message'] = 'Policy grant removed successfully'
                    break
                except Exception as e:
                    if attempt < max_retries - 1:
                        logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                        retry_delay *= 3  # Exponential backoff
                    # else:
                    #     raise

    except Exception as e:
        logger.warning(f"Error during {request_type} operation: {e}")
        status = cfnresponse.FAILED
        reason = str(e)
        response_data['Error'] = reason

    finally:
        # Crucial for Custom Resources: send a response back to CloudFormation
        cfnresponse.send(event, context, status, response_data)