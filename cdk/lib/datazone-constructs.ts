import * as cdk from 'aws-cdk-lib';
import * as datazone from 'aws-cdk-lib/aws-datazone';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { DomainUnitPermissionGranter } from './custom-resources';
import { CdkStack } from './cdk-stack';
import { createProjectLineageResources } from './datazone-dependables';


export interface DatazoneDomainConfig {
    domainExecutionRole: string;
    description?: string;
    domainVersion?: string;
    kmsKeyIdentifier?: string
    serviceRole?: string;
    singleSignOn?: any;
    tags?: any;
}

export interface DatazoneUserConfig {
  userIdentifier: string;
  status: string;
  userType: string;
}
  
export interface DataZoneBlueprintConfig {
    domainIdentifier: string | undefined; 
    environmentBlueprintIdentifier: string;
    enabledRegions: string[];
    manageAccessRoleArn: string;
    provisioningRoleArn: string;
    regionalParameters: RegionalParameter[];
    // Add other properties as needed
}
  
export interface RegionalParameter {
    region: string;
    parameters: Record<string, string>; // Or a more specific type if parameters have a defined structure
}

export interface ProjectConfig {
  // source_bucket: string;
  name: string;
  description?: string;
  domainUnitId?: string;
  glossaryTerms?: string[];
  project_membership?: Record<string, MembershipParameter>;
  // schedule_trigger_timing: string;
  // entity_type: string;
  entities: entityConfig[];
}

export interface entityConfig{
  entity_type: string;
  source_bucket: string;
  schedule_trigger_timing: string;
}
  
export interface MembershipParameter {
    designation: string;
    userIdentifier?: string;
    groupIdentifier?: string;
    predefinedUserKey?: string;
}
  
export interface EnvironmentProfileConfig {
    awsAccountId: string;
    awsAccountRegion: string;
    domainIdentifier: string;
    environmentBlueprintIdentifier: string;
    projectIdentifier: string;
    description?: string;
}

export interface DatazoneEnvironmentConfig {
    domainIdentifier: string;
    projectIdentifier: string;
    description?: string;
    environmentAccountIdentifier?: string;
    environmentAccountRegion?: string;
    environmentProfileIdentifier?: string;
    environmentRoleArn?: string;
    glossaryTerms: string[];
    userParameters?: EnvironmentParameterProperty[];
}
  
export interface EnvironmentParameterProperty {
    name: string;
    value: string;
}

export interface DomainHierarchy {
  domainName: string;
  domainUnits: DomainUnit[];
}

export interface DomainUnit {
  name: string;
  domainUnits: DomainUnit[];
  projects?: ProjectConfig[];
}
  

export function create_datazone_domain(scope: Construct, domainName: string, domain_config: DatazoneDomainConfig, vpc:any, vpcSubnets:any, securityGroups:any){
    // const domainExecutionRole = iam.Role.fromRoleName(scope, `domian_role_${domain_config.domainExecutionRole}`, domain_config.domainExecutionRole);
    const domain = new datazone.CfnDomain(scope, `DataZoneDomain_${domainName}`, {
      name: domainName,
      description: domain_config.description,
      domainExecutionRole: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/service-role/${domain_config.domainExecutionRole}`,
      kmsKeyIdentifier: domain_config.kmsKeyIdentifier
    });

    const sharedResources = require('./shared-resources').SharedResources.getInstance(scope, vpc, vpcSubnets, securityGroups);

    const all_project_member_permission_granter = new DomainUnitPermissionGranter(scope, `project-member-all-user-grant-permissions`, {
        domainId: domain.ref,
        domainUnitId: domain.attrRootDomainUnitId, 
        principalArn: '',
        principalType: 'root',
        policyType: 'ADD_TO_PROJECT_MEMBER_POOL',
        entityType: 'DOMAIN_UNIT',
        includeChildDomainUnits: true,
        vpc: vpc,
        vpcSubnets: vpcSubnets,
        securityGroups: securityGroups, 
      });

    return domain;
}

export function create_datazone_user(scope: Construct, user_config: DatazoneUserConfig, domainId: string){
  const user = new datazone.CfnUserProfile(scope, `Datazone_user_${user_config.userIdentifier}`, {
    domainIdentifier: domainId,
    userIdentifier: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${user_config.userIdentifier}`,
    status: user_config.status,
    userType: user_config.userType
  });
  return user;
}


export function create_datazone_blueprint(scope: Construct,blueprint_config: DataZoneBlueprintConfig, domainId: string | undefined, bucket_name: string | undefined){
    if (!domainId) {
      console.warn(
        "DataZone Domain has not been created yet. Blueprint creation skipped."
      );
      return undefined; // Or throw an error if this is critical
    }
    const provision_role = iam.Role.fromRoleName(scope, `provision_role_${blueprint_config.provisioningRoleArn}`, blueprint_config.provisioningRoleArn);
    const manage_access_role = iam.Role.fromRoleName(scope, `manage_access_role_${blueprint_config.manageAccessRoleArn}`, blueprint_config.manageAccessRoleArn);
    const regionalParams = blueprint_config.regionalParameters.map(rp => ({
      region: cdk.Aws.REGION,
      parameters: {
        S3Location: `s3://${bucket_name}`
      }
    }));

    const blueprint = new datazone.CfnEnvironmentBlueprintConfiguration(scope, 'blueprint',{
      domainIdentifier: domainId,
      environmentBlueprintIdentifier: blueprint_config.environmentBlueprintIdentifier,
      enabledRegions: [cdk.Aws.REGION],
      manageAccessRoleArn: manage_access_role.roleArn,
      provisioningRoleArn: provision_role.roleArn,
      regionalParameters: regionalParams
    });
    return blueprint;
} 


export function create_datazone_project(
  scope: Construct, 
  projectName: string, 
  project_config: ProjectConfig, 
  domainId: string, 
  dataZoneUsersMap: Map<string, datazone.CfnUserProfile>, 
  rootDomainId?: string
): [datazone.CfnProject, datazone.CfnProjectMembership[] | undefined]{
    // const membership_config = project_config.project_membership;
    const dz_project = new datazone.CfnProject(scope, `DataZoneProject_${projectName}`, {
      domainIdentifier: domainId,
      name: projectName,
      description: project_config?.description,
      domainUnitId: project_config?.domainUnitId,
      glossaryTerms: project_config?.glossaryTerms
    });

    const createdMemberships: datazone.CfnProjectMembership[] = []; // Array to hold all created memberships

    // Access the project_membership object
    const projectMembershipsConfig = project_config.project_membership;

    if (projectMembershipsConfig) {
      // Iterate over the keys (e.g., 'member1', 'member2') of the project_membership object
      for (const memberKey in projectMembershipsConfig) {
        if (Object.prototype.hasOwnProperty.call(projectMembershipsConfig, memberKey)) {
          const membership_config = projectMembershipsConfig[memberKey];

          let memberUserIdentifier: string | undefined;

          // Determine the user identifier based on predefinedUserKey or userIdentifier
          if (membership_config.predefinedUserKey) {
              const userProfile = dataZoneUsersMap.get(membership_config.predefinedUserKey);
              if (userProfile) {
                  memberUserIdentifier = cdk.Fn.select(1, cdk.Fn.split('|', userProfile.ref));
              } else {
                  console.warn(`Predefined user '${membership_config.predefinedUserKey}' not found in dataZoneUsersMap for project '${projectName}' member '${memberKey}'. Project membership might fail.`);
              }
          } else {
              // Use the userIdentifier directly from the config if no predefinedUserKey
              memberUserIdentifier = (membership_config as any).userIdentifier; // Cast to any because it's not in MembershipParameter
          }

          // Ensure that at least one userIdentifier source is available
          if (!memberUserIdentifier && !membership_config.groupIdentifier) {
              console.warn(`No userIdentifier or groupIdentifier resolved for project '${projectName}' member '${memberKey}'. Skipping this membership creation.`);
              continue; // Skip to the next member
          }

          const projectMembership = new datazone.CfnProjectMembership(scope, `DataZoneProjectMembership_${projectName}_${memberKey}`, {
            designation: membership_config.designation,
            domainIdentifier: rootDomainId ?? domainId,
            member: {
              userIdentifier: memberUserIdentifier,
              groupIdentifier: membership_config.groupIdentifier
            },
            projectIdentifier: cdk.Fn.select(1, cdk.Fn.split('|', dz_project.ref))
          });

          // Add dependency to ensure the project is created before its memberships
          projectMembership.node.addDependency(dz_project);

          // Add dependency on the user profile if it was found in the map
          if (membership_config.predefinedUserKey) {
            const userProfile = dataZoneUsersMap.get(membership_config.predefinedUserKey);
            if (userProfile) {
                projectMembership.node.addDependency(userProfile);
            }
          }

          createdMemberships.push(projectMembership); // Add to the list
        }
      }
    }

    // Return the project and the array of created memberships
    return [dz_project, createdMemberships.length > 0 ? createdMemberships : undefined];
    
  }


export function create_environment_profile(scope: Construct, profileName: string, profile_config: EnvironmentProfileConfig, domainId: string | undefined, blueprintId: string | undefined, projectId: string | undefined){
    if (!domainId || !blueprintId || !projectId) {
        console.warn("DataZone Domain ID, Blueprint ID, or Project ID is not available. Environment Profile creation skipped.");
        return undefined;
      }
    const environmentProfile = new datazone.CfnEnvironmentProfile(scope, `DataZoneEnvironmentProfile_${profileName}`, {
      domainIdentifier: domainId,
      name: profileName,
      environmentBlueprintIdentifier: cdk.Fn.select(1, cdk.Fn.split('|',blueprintId)),
      projectIdentifier: cdk.Fn.select(1, cdk.Fn.split('|',projectId)),
      description: profile_config.description,
      awsAccountId: cdk.Aws.ACCOUNT_ID,
      awsAccountRegion: cdk.Aws.REGION
    });
    return environmentProfile
}


export function create_datazone_environment(scope: Construct, env_name: string, env_config: DatazoneEnvironmentConfig, domainId: string | undefined, projectId: string | undefined, profileId: string | undefined){
    if (!domainId || !projectId || !profileId) {
        console.warn("DataZone Domain ID, Project ID, or Environment Profile ID is not available. Environment creation skipped.");
        return undefined;
      }
    const datazone_environment = new datazone.CfnEnvironment(scope, `DataZoneEnvironment_${env_name}`, {
    description: env_config.description,
    domainIdentifier: domainId,
    name: env_name,
    environmentAccountIdentifier: cdk.Aws.ACCOUNT_ID,
    environmentAccountRegion: cdk.Aws.REGION,
    environmentProfileIdentifier: cdk.Fn.select(1, cdk.Fn.split('|', profileId)),
    projectIdentifier: cdk.Fn.select(1, cdk.Fn.split('|',projectId)),
    });
    return datazone_environment
}

export function create_datazone_domain_units(scope: Construct, domainId: string, domainUnits: DomainUnit[], root_domain_unit: string, domain: datazone.CfnDomain, qualifier:any, vpc:any, vpcSubnets:any, securityGroups:any, dataZoneUsersMap: Map<string, datazone.CfnUserProfile>, blueprintConfigId: string): void {
  // Initialize shared resources
  const sharedResources = require('./shared-resources').SharedResources.getInstance(scope, vpc, vpcSubnets, securityGroups);
  // Create parent domain units first and store their references
  const domainUnitMap = new Map<string, datazone.CfnDomainUnit>();
  const projectMap = new Map<string, datazone.CfnProject>();

  // Function to create domain unit and its children recursively
  const createDomainUnitHierarchy = (unit: DomainUnit, parentId: string, parentUnit?: string) => {
    try {

      const constructId = parentUnit ? `DataZoneDomainUnit-${parentUnit}-${unit.name}` : `DataZoneDomainUnit-${unit.name}`;
      // Create the domain unit with required parentDomainUnitIdentifier
      const domainUnit = new datazone.CfnDomainUnit(
        scope, 
        constructId,
        {
          domainIdentifier: domainId,
          name: unit.name,
          description: `Domain unit for ${unit.name}`,
          parentDomainUnitIdentifier: parentId // parentId  // For root level, this will be the domain ID
        }
      );

      // Store reference
      domainUnitMap.set(unit.name, domainUnit);


      // Grant CREATE_PROJECT permission to the IAM Role/user
      const projectCreatorsGroupId = `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-${qualifier}-cfn-exec-role-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`
      const projectCreatorsPrincipalType: 'IAM_ROLE' = 'IAM_ROLE'; // Match the type of the ARN

      const project_creation_permission_granter = new DomainUnitPermissionGranter(scope, `GrantProjectCreate-${constructId}`, {
        domainId: domainId,
        domainUnitId: cdk.Fn.select(1, cdk.Fn.split('|', domainUnit.ref)), 
        principalArn: projectCreatorsGroupId,
        principalType: projectCreatorsPrincipalType,
        policyType: 'CREATE_PROJECT',
        entityType:'DOMAIN_UNIT',
        includeChildDomainUnits: true,
        vpc: vpc,
        vpcSubnets: vpcSubnets,
        securityGroups: securityGroups, 
      });
      project_creation_permission_granter.customResource.node.addDependency(domainUnit);

      // for all the users in user management, adding them to domain unit project member creation policy
      let roles: string[] = [];
      roles = roles.concat(projectCreatorsGroupId);
      for (const [userName, userProfile] of dataZoneUsersMap.entries()){
        roles = roles.concat(userProfile.userIdentifier)
      }
      const project_member_addition_permission_granters: DomainUnitPermissionGranter[] = [];

      roles.forEach((role, index) =>{
        const project_member_addition_permission_granter = new DomainUnitPermissionGranter(scope, `GrantProjectMemberAddition-${index}-${constructId}`, {
          domainId: domainId,
          domainUnitId: cdk.Fn.select(1, cdk.Fn.split('|', domainUnit.ref)), 
          principalArn: role,
          principalType: projectCreatorsPrincipalType,
          policyType: 'ADD_TO_PROJECT_MEMBER_POOL',
          entityType:'DOMAIN_UNIT',
          includeChildDomainUnits: false,
          vpc: vpc,
          vpcSubnets: vpcSubnets,
          securityGroups: securityGroups, 
        });
        project_member_addition_permission_granter.customResource.node.addDependency(domainUnit);
        project_member_addition_permission_granters.push(project_member_addition_permission_granter);
      });
      
      
      // Create projects for this domain unit if they exist
      if (unit.projects && unit.projects.length > 0) {
        unit.projects.forEach((project, index) => {
          const projectId = `${constructId}-Project-${project.name}`;
          project.domainUnitId = cdk.Fn.select(1, cdk.Fn.split('|', domainUnit.ref));
          const [datazoneProject, memberships] = create_datazone_project(scope, project.name, project, cdk.Fn.select(0, cdk.Fn.split('|',domainUnit.ref)),dataZoneUsersMap, domainId)
          // Store reference to project
          projectMap.set(`${unit.name}-${project.name}`, datazoneProject);
          
          // Add dependency to ensure domain unit exists before creating project
          datazoneProject.node.addDependency(domainUnit);
          // Add dependency on both the Lambda function and the custom resource
          datazoneProject.node.addDependency(project_creation_permission_granter.lambdaFunction);
          datazoneProject.node.addDependency(project_creation_permission_granter.customResource);

          project_member_addition_permission_granters.forEach(granter => {
            datazoneProject.node.addDependency(granter.customResource);
          });

          if (memberships) { // memberships is CfnProjectMembership[] | undefined
            memberships.forEach(membership => {
              membership.node.addDependency(datazoneProject);
              project_member_addition_permission_granters.forEach(granter => {
                membership.node.addDependency(granter.customResource);
              });
            });
          }

          const project_id = datazoneProject.attrId

          // granting the environment profile creation for this project
          const environment_profile_creation_permission_granter = new DomainUnitPermissionGranter(scope, `GrantEnvProfile-${constructId}-${index}`,{
            domainId: domainId,
            domainUnitId: cdk.Fn.select(1, cdk.Fn.split('|', domainUnit.ref)), 
            principalArn: projectCreatorsGroupId,
            principalType: projectCreatorsPrincipalType,
            policyType: 'CREATE_ENVIRONMENT_PROFILE',
            entityType: 'ENVIRONMENT_BLUEPRINT_CONFIGURATION',
            environment_blueprint_config_id: `${cdk.Aws.ACCOUNT_ID}:${cdk.Fn.select(1, cdk.Fn.split('|', blueprintConfigId))}`,
            project_id: project_id,
            vpc: vpc,
            vpcSubnets: vpcSubnets,
            securityGroups: securityGroups,
          });
          environment_profile_creation_permission_granter.customResource.node.addDependency(domainUnit);

          // creating the environment profile for the mentioned project
          const environment_profile = create_environment_profile(
            scope,
            `env_profile_${domainUnit.name}_${datazoneProject.name}`,
            {
              awsAccountId: cdk.Aws.ACCOUNT_ID,
              awsAccountRegion: cdk.Aws.REGION,
              domainIdentifier: domainId,
              environmentBlueprintIdentifier: blueprintConfigId,
              projectIdentifier: datazoneProject.ref,
              description: `environment profile for the project ${datazoneProject.name} in the domain unit ${domainUnit.name}`
            },
            domainId,
            blueprintConfigId,
            datazoneProject.ref
          );
          if (environment_profile){
            environment_profile.node.addDependency(environment_profile_creation_permission_granter.customResource);
          }

          // creating the environment for the mentioned project
          if (environment_profile){
              // granting the environment creation permissions for the environment profile
              const environment_creation_permission_granter = new DomainUnitPermissionGranter(scope, `GrantEnvironment-${constructId}-${index}`,{
                domainId: domainId,
                domainUnitId: cdk.Fn.select(1, cdk.Fn.split('|', domainUnit.ref)), 
                policyType: 'CREATE_ENVIRONMENT',
                entityType: 'ENVIRONMENT_PROFILE',
                environment_profile_id: environment_profile.attrId,
                project_id: project_id,
                vpc: vpc,
                vpcSubnets: vpcSubnets,
                securityGroups: securityGroups,
                forceUpdate: true
              });
              environment_creation_permission_granter.customResource.node.addDependency(domainUnit);

              const environment = create_datazone_environment(
              scope,
              `env_${domainUnit.name}_${datazoneProject.name}`,
              {
                domainIdentifier: domainId,
                projectIdentifier: datazoneProject.ref,
                description:  `environment for the project ${datazoneProject.name} in the domain unit ${domainUnit.name}`,
                environmentAccountIdentifier: cdk.Aws.ACCOUNT_ID,
                environmentAccountRegion: cdk.Aws.REGION,
                environmentProfileIdentifier: environment_profile.ref,
                environmentRoleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/AmazonDatazoneGlueProvisioningRole`,
                glossaryTerms: [],
                userParameters: []
              },
              domainId, 
              datazoneProject.ref, 
              environment_profile.ref
            );
            if (environment){
              environment.node.addDependency(environment_creation_permission_granter.customResource);

              // --- BEGIN: Create lineage resources for this project ---
              // You may need to adjust these role ARNs to match your stack context
              const glueProvisioningRoleArn = `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/AmazonDatazoneGlueProvisioningRole`;
              // Use the Glue database name from the environment object
              const glueDatabaseName = `env_${domainUnit.name}_${datazoneProject.name}`.replace(/\s+/g,'').toLowerCase() + '_pub_db'
              const parentUnitName = parentUnit ? parentUnit : ''
              if (project.entities){
                project.entities.forEach((entity, index) => {
                  createProjectLineageResources(
                    scope,
                    entity.source_bucket,
                    domainUnit.name,
                    parentUnitName,
                    datazoneProject.name,
                    cdk.Aws.ACCOUNT_ID,
                    cdk.Aws.REGION,
                    glueProvisioningRoleArn,
                    glueDatabaseName,
                    domainId,
                    datazoneProject.ref,
                    entity.schedule_trigger_timing,
                    entity.entity_type
                  );
                })
              };
              // --- END: Create lineage resources for this project ---
            }
          }
        });
      }

      // Create children if they exist
      if (unit.domainUnits && unit.domainUnits.length > 0) {
        unit.domainUnits.forEach(childUnit => {
          const childDomainUnit = createDomainUnitHierarchy(childUnit, cdk.Fn.select(1, cdk.Fn.split('|',domainUnit.ref)), domainUnit.name);
          if (childDomainUnit) {
            childDomainUnit.addDependency(domainUnit);
          }
        });
      }

      return domainUnit;

    } catch (error) {
      console.error(`Error creating domain unit ${unit.name}:`, error);
      throw error;
    }
  };

  // Create all domain units, passing domain ID as parent for root level
  domainUnits.forEach(unit => {
    const domain_unit = createDomainUnitHierarchy(unit, root_domain_unit);
    domain_unit.node.addDependency(domain);
  });
}