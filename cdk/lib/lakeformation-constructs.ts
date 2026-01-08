import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import * as iam from 'aws-cdk-lib/aws-iam';


export interface DatalakeSettingConfig {
    admins: string[];
}

export interface LakeformationResourceConfig {
    resourceArn: string;
    useServiceLinkedRole: boolean;
    hybridAccessEnabled: boolean;
    roleArn: string;
    withFederation: boolean;
}
  
export interface LakeformationPermissionConfig {
    dataLakePrincipal: LakeformationPrincipalProperty;
    resource: LakeformationResourceProperty;
    permissions: string[] | [];
    permissionsWithGrantOption: string[] | [];
}
  
export interface LakeformationPrincipalProperty {
    dataLakePrincipalIdentifier: string;
}
  
export interface LakeformationResourceProperty {
    dataLocationResource: DataLocationResourceProperty;
}
  
export interface DataLocationResourceProperty {
    catalogId: string;
    s3Resource: string;
}

export function create_datalake_settings(scope: Construct, datalake_config: DatalakeSettingConfig){
    const admins: lakeformation.CfnDataLakeSettings.DataLakePrincipalProperty[] = datalake_config.admins.map(roleName => {
      const role = iam.Role.fromRoleName(scope, `${roleName}`, roleName)
      return {
        dataLakePrincipalIdentifier: role.roleArn
      }
    })
    const lakeformationSettings = new lakeformation.CfnDataLakeSettings(scope, `logical_id_datalake_settings`, {
      admins: admins
    })
    return lakeformationSettings;
}

export function create_lakeformation_resource(scope: Construct, resource_name:string, resource_config: LakeformationResourceConfig, role: iam.IRole){
    // const role:any = iam.Role.fromRoleName(scope, `logical_id_resource_${resource_config.roleArn}`, resource_config.roleArn);
    const resource_arn:string = `arn:aws:s3:::${resource_config.resourceArn}`
    const s3_resource = new lakeformation.CfnResource(scope, `lakeformation_s3_resource_${resource_name}`, {
      resourceArn: resource_arn,
      hybridAccessEnabled: resource_config.hybridAccessEnabled,
      roleArn: role.roleArn,
      useServiceLinkedRole: resource_config.useServiceLinkedRole,
      withFederation: resource_config.withFederation
    });
    return s3_resource
}


export function create_lakeformation_permission(scope: Construct, permission_name:string, permission_config: LakeformationPermissionConfig, qualifier: any, role: iam.IRole){
    
    // const role = iam.Role.fromRoleName( scope,`DataLakePrincipalRole_${permission_name}`,permission_config.dataLakePrincipal.dataLakePrincipalIdentifier);
    const s3LocationPermissions = new lakeformation.CfnPrincipalPermissions(scope,`S3LocationPermissions_${permission_name}`,{
      principal: {
        dataLakePrincipalIdentifier: role.roleArn,
      },
      resource: {
        dataLocation: {
          catalogId: cdk.Aws.ACCOUNT_ID,
          resourceArn: `arn:aws:s3:::${permission_config.resource.dataLocationResource.s3Resource}`
        }
      },
      permissions: permission_config.permissions,
      permissionsWithGrantOption: permission_config.permissionsWithGrantOption,
      }
    )
    return s3LocationPermissions;
}
  