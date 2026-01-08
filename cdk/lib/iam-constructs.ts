import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
// import { IAMClient, GetRoleCommand, NoSuchEntityException } from "@aws-sdk/client-iam";
import { Construct } from 'constructs';

export interface IamConfig {
    assume_roles: string[];
    managed_policies?: string[];
    attachemt_policies?: {
        actions: string[];
        resources: string[];
    };
    path?: string;
    trust_actions?: string[];
    trust_conditions?: {
      sourceAccount?: string;
      tagKeys?: string;
    }
}

// export async function checkRoleExists(roleName: string): Promise<boolean> {
//   const iamClient = new IAMClient({});
  
//   try {
//     await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
//     return true;
//   } catch (error) {
//     if (error instanceof NoSuchEntityException) {
//       return false;
//     }
//     throw error;
//   }
// }

export function create_iam_role(scope: Construct, roleName: string, roleConfig: IamConfig): any {
  const assumePrincipals: iam.IPrincipal[] = [];
  for (const principal of roleConfig.assume_roles) {
    assumePrincipals.push(new iam.ServicePrincipal(principal));
  }

  const newRole = new iam.Role(scope, `logical_id_${roleName}`, {
    roleName: roleName,
    assumedBy: new iam.CompositePrincipal(...assumePrincipals),
    inlinePolicies: roleConfig?.attachemt_policies?.actions && roleConfig?.attachemt_policies?.resources
      ? {
        attachmentPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: roleConfig.attachemt_policies.actions,
              resources: roleConfig.attachemt_policies.resources
            })
          ]
        })
      } : undefined,
    managedPolicies: roleConfig?.managed_policies?.map(policyName =>
      iam.ManagedPolicy.fromAwsManagedPolicyName(policyName)
    ),
    path: roleConfig?.path
  });

  const trust_actions = [...new Set([...(roleConfig.trust_actions || [])])];
  const conditions: { [key: string]: { [key: string]: string | string[] } } = {};

  if (roleConfig.trust_conditions?.sourceAccount) {
    conditions['StringEquals'] = { 'aws:SourceAccount': roleConfig.trust_conditions.sourceAccount };
  } else {
    conditions['StringEquals'] = { 'aws:SourceAccount': cdk.Aws.ACCOUNT_ID };
  }
  if (roleConfig.trust_conditions?.tagKeys) {
    conditions['ForAllValues:StringLike'] = { 'aws:TagKeys': roleConfig.trust_conditions.tagKeys };
  }

  const trust_policy_statement:any = {
    "Effect": "Allow",
    "Principal": {
      "Service": "datazone.amazonaws.com"
    },
    "Action": trust_actions
  };

  if (Object.keys(conditions).length > 1) {
    trust_policy_statement["Condition"] = conditions;
  }

  const assumeRolePolicyDocument: any = {
    "Version": "2012-10-17",
    "Statement": [trust_policy_statement]
  };
  if (roleConfig.trust_actions){
    const cfnRole = newRole.node.defaultChild as iam.CfnRole;
    if (cfnRole) {
      cfnRole.assumeRolePolicyDocument = assumeRolePolicyDocument;
    } else {
      console.warn("Could not access CfnRole for " + roleName);
    }
  }
  return newRole;
}