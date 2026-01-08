import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as path from 'path';
import { Construct } from 'constructs';
import { DefaultStackSynthesizer } from 'aws-cdk-lib';

/**
 * Singleton class to manage shared resources across the stack
 */
export class SharedResources {
  private static instance: SharedResources;
  private lambdaFunction: lambda.Function;
  private provider: cr.Provider;
  private scope: Construct;
  private qualifier: string;
  
  private constructor(scope: Construct, vpc?: ec2.IVpc, vpcSubnets?: ec2.SubnetSelection, securityGroups?: ec2.ISecurityGroup[]) {
    this.scope = scope;
    
    this.qualifier = scope.node.tryGetContext('@aws-cdk/core:bootstrapQualifier') || DefaultStackSynthesizer.DEFAULT_QUALIFIER;
    const lambdaRole = iam.Role.fromRoleArn(scope,'LambdaExecutionRolex',`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-${this.qualifier}-cfn-exec-role-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`)

    // Create the shared Lambda function
    this.lambdaFunction = new lambda.Function(scope, 'SharedDomainUnitPermissionLambda', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'datazone_policy_grant_handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
      timeout: cdk.Duration.minutes(15),
      memorySize: 256,
      vpc: vpc,
      vpcSubnets: vpcSubnets,
      securityGroups: securityGroups,
      allowPublicSubnet: false,
      role: lambdaRole,
    });
    
    // Add domain admin permissions
    this.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:PassRole',
        'datazone:*'
      ],
      resources: ['*']
    }));
    
    // Create a shared provider
    this.provider = new cr.Provider(scope, 'SharedDomainUnitPermissionProvider', {
      onEventHandler: this.lambdaFunction,
      logRetention: cdk.aws_logs.RetentionDays.ONE_MONTH
    });
  }
  
  /**
   * Get the singleton instance of SharedResources
   */
  public static getInstance(scope: Construct, vpc?: ec2.IVpc, vpcSubnets?: ec2.SubnetSelection, securityGroups?: ec2.ISecurityGroup[]): SharedResources {
    if (!SharedResources.instance) {
      SharedResources.instance = new SharedResources(scope, vpc, vpcSubnets, securityGroups);
    }
    return SharedResources.instance;
  }
  
  /**
   * Create a custom resource using the shared Lambda function
   */
  public createCustomResource(id: string, props: {
    domainId: string;
    domainUnitId?: string;
    principalArn?: string;
    principalType?: 'IAM_USER' | 'IAM_GROUP' | 'IAM_ROLE' | 'root';
    entityType: 'DOMAIN_UNIT' | 'ENVIRONMENT_BLUEPRINT_CONFIGURATION' | 'ENVIRONMENT_PROFILE' | 'ASSET_TYPE';
    policyType: string;
    includeChildDomainUnits?: boolean;
    environment_blueprint_config_id?: string;
    environment_profile_id?: string;
    project_id?: string;
    forceUpdate?: boolean;
  }): cdk.CustomResource {
    let entity_identifier: any;
    if (props.entityType === 'DOMAIN_UNIT'){
      entity_identifier = props.domainUnitId
    }else if (props.entityType === 'ENVIRONMENT_BLUEPRINT_CONFIGURATION'){
      entity_identifier = props.environment_blueprint_config_id
    } else if (props.entityType === 'ENVIRONMENT_PROFILE'){
      entity_identifier = props.environment_profile_id
    }

    const resourceProps: any = {
      DomainIdentifier: props.domainId,
      DomainUnitIdentifier: props.domainUnitId,
      EntityIdentifier: entity_identifier,
      EntityType: props.entityType,
      PolicyType: props.policyType,
      PrincipalType: props.principalType,
      PrincipalArn: props.principalArn,
      project_id: props.project_id,
      IncludeChildDomainUnits: props.includeChildDomainUnits || false,
    };

    if (props.forceUpdate) {
      resourceProps.Timestamp = Date.now().toString();
    }

    const customResource = new cdk.CustomResource(this.scope, id, {
      serviceToken: this.provider.serviceToken,
      properties: resourceProps,
    });
    
    // Add dependency on the Lambda function
    customResource.node.addDependency(this.lambdaFunction);
    
    return customResource;
  }
  
  /**
   * Get the shared Lambda function
   */
  public getLambdaFunction(): lambda.Function {
    return this.lambdaFunction;
  }
}