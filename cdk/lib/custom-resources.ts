import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SharedResources } from './shared-resources';

export interface DomainUnitPermissionGranterProps {
  domainId: string;
  domainUnitId: string;
  principalArn?: string;
  principalType?: 'IAM_USER' | 'IAM_GROUP' | 'IAM_ROLE' | 'root';
  policyType: 
    'CREATE_PROJECT' | 
    'ADD_TO_PROJECT_MEMBER_POOL' | 
    'CREATE_GLOSSARY' | 
    'CREATE_FORM_TYPE' | 
    'CREATE_ASSET_TYPE' | 
    'CREATE_ENVIRONMENT_PROFILE' | 
    'CREATE_ENVIRONMENT' | 
    'CREATE_ENVIRONMENT_FROM_BLUEPRINT' | 
    'CREATE_PROJECT_FROM_PROJECT_PROFILE';
  includeChildDomainUnits?: boolean;
  environment_blueprint_config_id?: string;
  environment_profile_id?:string;
  project_id?: string;
  entityType: 'DOMAIN_UNIT' | 'ENVIRONMENT_BLUEPRINT_CONFIGURATION' | 'ENVIRONMENT_PROFILE' | 'ASSET_TYPE';
  vpc?: any;
  vpcSubnets?: any;
  securityGroups?: any[];
  forceUpdate?: boolean;
}

export class DomainUnitPermissionGranter extends Construct {
  public readonly customResource: cdk.CustomResource;
  public readonly lambdaFunction: any;
  
  constructor(scope: Construct, id: string, props: DomainUnitPermissionGranterProps) {
    super(scope, id);
    
    // Get the shared resources instance
    const sharedResources = SharedResources.getInstance(
      scope, 
      props.vpc, 
      props.vpcSubnets, 
      props.securityGroups
    );
    
    // Create a custom resource using the shared Lambda function
    this.customResource = sharedResources.createCustomResource(`${id}-CustomResource`, {
      domainId: props.domainId,
      domainUnitId: props.domainUnitId,
      principalArn: props.principalArn,
      principalType: props.principalType,
      entityType: props.entityType,
      policyType: props.policyType,
      includeChildDomainUnits: props.includeChildDomainUnits,
      environment_blueprint_config_id: props.environment_blueprint_config_id,
      environment_profile_id: props.environment_profile_id,
      project_id: props.project_id,
      forceUpdate: props.forceUpdate
    });
    
    // Store a reference to the shared Lambda function
    this.lambdaFunction = sharedResources.getLambdaFunction();
  }
}