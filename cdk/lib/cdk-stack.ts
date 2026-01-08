import * as cdk from "aws-cdk-lib";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as aws_events from 'aws-cdk-lib/aws-events';
import * as datazone from 'aws-cdk-lib/aws-datazone';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import { VendedConstructs } from "./vended-constructs";
import * as path from 'path';
import * as fs from 'fs';
import * as s3_deploy from 'aws-cdk-lib/aws-s3-deployment'
import { BucketConfig, create_bucket } from './s3-constructs';
import { 
  IamConfig, 
  create_iam_role, 
  // checkRoleExists, 
} from './iam-constructs';
import {
  GlueConfig,
  GlueWorkflowConfig,
  GlueTriggerConfig,
  create_glue_job,
  create_glue_workflow,
  create_glue_trigger,
  GlueConnectionConfig,
  // checkGlueJobExists,
} from './glue-constructs';
import { EventBridgeRuleConfig, create_event_bridge_rule } from './eventbridge-constructs';
import {
  DatazoneDomainConfig,
  DatazoneUserConfig,
  DataZoneBlueprintConfig,
  ProjectConfig,
  EnvironmentProfileConfig,
  DatazoneEnvironmentConfig,
  create_datazone_domain,
  create_datazone_user,
  create_datazone_blueprint,
  create_datazone_project,
  create_environment_profile,
  create_datazone_environment,
  create_datazone_domain_units,
} from './datazone-constructs';
import {
  DatalakeSettingConfig,
  LakeformationResourceConfig,
  LakeformationPermissionConfig,
  create_datalake_settings,
  create_lakeformation_resource,
  create_lakeformation_permission,
} from './lakeformation-constructs';
import { GlueCrawlerConfig, create_glue_crawler, create_glue_connecstion } from './glue-constructs';
import { config,loadConfig } from "./config-reader";
import { promises } from 'dns';
import { lambdaFunctionConfig, create_lambda_function} from './lambda-constructs';
import { snsTopicConfig, create_sns_topic } from './sns-constructs';

export interface CdkStackProps extends cdk.StackProps {
   assetId: string;
   gitOrg: string;
   gitRepo: string;
   imageTag: string;
   appEnv: string;
   environmentVars?: { [key: string]: string };
}

/*
 * A CDK Stack for your infrastructure
 */
export class CdkStack extends cdk.Stack {
  public config: any;
  public domainConfig: any;
  public sourceBucket?: s3.Bucket;
  public sql_scripts: any;
  public targetBucket?: s3.Bucket;
  public targetBucketName?: string;
  public bluePrintBucket?: s3.Bucket;
  public sqlAssetsBucket?: s3.Bucket;
  public mapperConfigBucket?: s3.Bucket;
  public bucketMap: { [logicalName: string]: s3.Bucket } = {};
  public glueRole: iam.Role;
  public AmazonDatazoneGlueProvisioningRole?: iam.Role;
  public AmazonDatazoneGlueManageAccessRole?: iam.Role;
  public AmazonDatazoneDomainExecutionRole?: iam.Role;
  public glueJob?: glue.CfnJob;
  public glueConnection?: glue.CfnConnection;
  public assetPublishingJob ?: glue.CfnJob;
  public workflow?: glue.CfnWorkflow;
  public asssetPublishingWorkflow?: glue.CfnWorkflow;
  public trigger?: glue.CfnTrigger;
  public firingTrigger?: glue.CfnTrigger;
  public assetPublishingTrigger?: glue.CfnTrigger;
  public eventBridgeRule?: aws_events.Rule;
  public eventBridgeRuleForAssetPublishion?: aws_events.Rule;
  public eventBridgeRuleForAssetMetadataDownload?: aws_events.Rule;
  public datazoneDomain?: datazone.CfnDomain;
  public datazoneDomainName?: string;
  public datazoneUser?: datazone.CfnUserProfile;
  public datazoneBlueprint?: datazone.CfnEnvironmentBlueprintConfiguration;
  public datazoneProject?: any;
  public datazoneProjectMembership?: any;
  public datazoneProjectName?: string;
  public environmentProfile?: datazone.CfnEnvironmentProfile;
  public environmentProfileName?: string;
  public datazoneEnviromentName?: string;
  public datazoneEnvironment?: datazone.CfnEnvironment;
  public glueProvisioningRole?: iam.Role;
  public manageAccessRole?: iam.Role;
  public lakeformationResource?: lakeformation.CfnResource;
  public lakeformationPermission?: lakeformation.CfnPrincipalPermissions;
  public glueCrawler?: glue.CfnCrawler;
  public lambdaFunction?: lambda.Function;
  public lakeSettings?: lakeformation.CfnDataLakeSettings;
  public rootDomainUnitId?: string;
  public appVpc: ec2.IVpc; 
  public snsTopic: sns.ITopic;
  public lambdaExecutionSecurityGroup: ec2.ISecurityGroup;
  public readonly datazoneUsersMap: Map<string, datazone.CfnUserProfile> = new Map();
  constructor(scope: cdk.App, id: string, props: CdkStackProps) {
    super(scope, id, props);
    const envContext = scope.node.tryGetContext(props.appEnv);
    const region = process.env.CDK_DEFAULT_REGION || "us-west-2";

    // keep these lines to support vended constructs from devportal

    const vended = new VendedConstructs(this, "VendedConstructs", {
      assetId: props.assetId,
      appEnv: props.appEnv,
      imageTag: props.imageTag,
    });

    // your custom infrastructure code goes here 👇
   if (props.appEnv == "qal" && region == "us-west-2"){
      new IntuVpc(this, "vpc_logical_id", {
      appEnv: props.appEnv,
      assetId: props.assetId,
      environment: 'development',
      vpcName: 'ppl-3p-data-vpc',
      customProps: {
          privateSubnetSize: "27",
          dataSubnetSize: "28",
          egressSubnetSize: "28",
          ingressSubnetSize: "28",
        },
      includeBastion: true,
    });
   }

   // lambda function creation with in vpc
   this.appVpc = ec2.Vpc.fromLookup(this, 'defaultVpc', {
      vpcId: 'vpc-05cbaa01b803e89b1',
    });

    this.lambdaExecutionSecurityGroup = ec2.SecurityGroup.fromLookupById(
        this, 
        'DefaultVPCSecurityGroup', // Logical ID for the lookup
        'sg-0753b5c419281ba18' // <--- REPLACE WITH THE ACTUAL ID OF YOUR EXISTING SECURITY GROUP (eg: default vpc security group)
    );


    this.config = loadConfig('config/datazone_basic_requirements.yaml')
    if (!this.config) {
      console.error("yaml configuration could not be loaded. Stack creation aborted.");
      return;
    }
    else{
      for (const resourceType in this.config.resources) {
        const resources = this.config.resources[resourceType];
        if (resources) {
          switch (resourceType) {
            case 's3_buckets':
              this.createS3Buckets(resources);
              break;
            case 'iam_roles':
              this.createIamRoles(resources);
              break;
            // case 'asset_uploads_to_s3':
            //   this.uploadAssets(resources);
            //   break;
            case 'glue_jobs':
              this.createGlueJobs(resources);
              break;
            case 'glue_connections':
              this.createGlueConnection(resources);
              break;
            case 'glue_workflows':
              this.createGlueWorkflows(resources);
              break;
            case 'glue_triggers':
              this.createGlueTriggers(resources);
              break;
            case 'event_bridge_rules':
              this.createEventBridgeRules(resources);
              break;
            case 'datazone_domains':
              this.createDatazoneDomains(resources);
              break;
            case 'datazone_users':
              this.createDatazoneUsers(resources);
              break;
            case 'datazone_blueprints':
              this.createDatazoneBlueprints(resources);
              break;
            case 'datazone_projects':
              this.createDatazoneProjects(resources);
              break;
            case 'datazone_environment_profiles':
              this.createEnvironmentProfiles(resources);
              break;
            case 'datalake_settings':
              this.createDatalakeSettings(resources);
              break;
            case 'datazone_environments':
              this.createDatazoneEnvironments(resources);
              break;
            case 'lakeformation_resources':
              this.createLakeformationResources(resources);
              break;
            case 'lakeformation_permissions':
              this.createLakeformationPermissions(resources);
              break;
            case 'glue_crawlers':
              this.createGlueCrawlers(resources);
              break;
            case 'lambda_functions':
              this.createLambdaFunctions(resources);
              break;
            case 'sns_topics':
              this.createSNSTopics(resources);
              break;
            default:
              console.log(`Unsupported resource type: ${resourceType}`);
          }
        }
      }
    }

    this.domainConfig = loadConfig('config/domain_hierarchy.yaml')
    if (!this.domainConfig) {
      console.error("domain configuration has been failed to load, unbale to create the domain units.");
      return;
    }
    else{
      if (this.AmazonDatazoneDomainExecutionRole && this.datazoneUsersMap && this.datazoneDomain){
        const qualifier = this.synthesizer.bootstrapQualifier;
        const cloudformantioon_exce_role = new lakeformation.CfnDataLakeSettings(this, 'DataLakeSettings', {
              admins: [
                {
                  // The CDK cloudformation execution role.
                  dataLakePrincipalIdentifier: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-${qualifier}-cfn-exec-role-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`
                },
              ],
            });
        if (this.datazoneBlueprint){
          create_datazone_domain_units(
            this, 
            this.datazoneDomain.ref, 
            this.domainConfig?.domainUnits, 
            this.datazoneDomain.attrRootDomainUnitId, 
            this.datazoneDomain,
            qualifier,
            this.appVpc,
            { subnets: this.appVpc.privateSubnets }, // Use private subnets with NAT Gateway
            [this.lambdaExecutionSecurityGroup],
            this.datazoneUsersMap,
            this.datazoneBlueprint.ref
          )
        }

      }
    }
    // Conditionally deploy sql_scripts if directory exists and has files (including subdirectories)
    const sqlScriptsDir = path.join(__dirname, './sql_scripts');
    let sqlScriptsAvailable = false;
    // Helper function to recursively check for any non-README file inside a directory
    function hasNonReadmeFiles(dir: string): boolean {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (hasNonReadmeFiles(fullPath)) {
            return true;
          }
        } else if (stat.isFile() && entry.toLowerCase() !== 'readme.md') {
          return true;
        }
      }
      return false;
    }
    try {
      if (fs.existsSync(sqlScriptsDir)) {
        if (hasNonReadmeFiles(sqlScriptsDir)) {
          sqlScriptsAvailable = true;
        }
      }
    } catch (err) {
      console.warn('Error checking sql_scripts directory:', err);
    }
    if (this.sqlAssetsBucket && sqlScriptsAvailable) {
      new s3_deploy.BucketDeployment(this, 'sql-scripts-to-create-in-athena', {
        sources: [s3_deploy.Source.asset(sqlScriptsDir, { exclude: ['readme.md', 'README.md'] })],
        destinationBucket: this.sqlAssetsBucket
      });
    }

    // uploading the mapper_config files conditionally
    const mapperConfigDir = path.join(__dirname, './mapper_configs');
    let mapperConfigScriptsAvailable = false;
    try {
      if (fs.existsSync(mapperConfigDir)) {
        const files = fs.readdirSync(mapperConfigDir).filter(f => fs.statSync(path.join(mapperConfigDir, f)).isFile()).filter(f => f.toLowerCase() !== 'readme.md');
        if (files.length > 0) {
          mapperConfigScriptsAvailable = true;
        }
      }
    } catch (err) {
      console.warn('Error checking mapper_configs directory:', err);
    }
    if (this.mapperConfigBucket && mapperConfigScriptsAvailable) {
      new s3_deploy.BucketDeployment(this, 'mapper-configs-to-add-in-s3', {
        sources: [s3_deploy.Source.asset(mapperConfigDir, { exclude: ['readme.md', 'README.md'] })],
        destinationBucket: this.mapperConfigBucket
      });
    }
    this.createOutputs();
  }

  private createS3Buckets(bucketsConfig: any): void {
    const bucketNames = Object.keys(bucketsConfig);
    for (const bucketName in bucketsConfig) {
      let bucket;
      bucket = create_bucket(this, bucketName, bucketsConfig[bucketName] as BucketConfig, cdk.Aws.ACCOUNT_ID, cdk.Aws.REGION);
      if (bucketName === 'pnp-datazone-sql-assets') {
        this.sqlAssetsBucket = bucket;
      } else if (bucketName === 'pnp-datazone-blueprint-bucket'){
        this.bluePrintBucket = bucket;
      } else if (bucketName === 'pnp-ips-mapper-configs'){
        this.mapperConfigBucket = bucket;
      }
      this.bucketMap[bucketName] = bucket;
    }
  }


  private  createIamRoles(rolesConfig: any){
    const roleNames = Object.keys(rolesConfig);
    for (const roleName in rolesConfig) {
      const iamRole = create_iam_role(this, roleName, rolesConfig[roleName] as IamConfig);
      if (roleNames.length > 0 && roleNames[0] === roleName) {
        this.AmazonDatazoneGlueProvisioningRole = iamRole;
      }
      if (roleNames.length > 1 && roleNames[1] === roleName) {
        this.AmazonDatazoneGlueManageAccessRole = iamRole;
      }
      if (roleNames.length > 2 && roleNames[2] === roleName) {
        this.AmazonDatazoneDomainExecutionRole = iamRole;
      }     
    }
  }

  private createGlueConnection(connectionConfig: any){
    const glue_connection = create_glue_connecstion(this, connectionConfig as GlueConnectionConfig);
    this.glueConnection = glue_connection;
  }

  private createGlueJobs(jobsConfig: any){
    const jobNames = Object.keys(jobsConfig);
    for (const jobName in jobsConfig) {
      const glueJob = create_glue_job(this, jobName, jobsConfig[jobName] as GlueConfig, this.glueConnection);
      if (jobNames.length > 0 && jobNames[0] === jobName) {
        this.assetPublishingJob = glueJob;
      }
      if (this.assetPublishingJob && this.AmazonDatazoneGlueProvisioningRole && this.glueConnection) {
        this.assetPublishingJob.node.addDependency(this.AmazonDatazoneGlueProvisioningRole);
        this.assetPublishingJob.node.addDependency(this.glueConnection);
      }
    }
  }

  private createGlueWorkflows(workflowsConfig: any): void {
    const workflowNames = Object.keys(workflowsConfig);
    for (const workflowName in workflowsConfig) {
      const workflow = create_glue_workflow(this, workflowName, workflowsConfig[workflowName] as GlueWorkflowConfig);
      if (workflowNames.length > 0 && workflowNames[0] === workflowName) {
        this.asssetPublishingWorkflow = workflow;
      } 
      if (this.assetPublishingJob && this.asssetPublishingWorkflow) {
        this.asssetPublishingWorkflow.node.addDependency(this.assetPublishingJob);
      }
    }
  }

  private createGlueTriggers(triggersConfig: any): void {
    const triggerNames = Object.keys(triggersConfig);
    for (const triggerName in triggersConfig) {
      const trigger = create_glue_trigger(this, triggerName, triggersConfig[triggerName] as GlueTriggerConfig);
      if (triggerNames.length > 0 && triggerNames[0] === triggerName) {
        this.assetPublishingTrigger = trigger;
      } 
      if (this.assetPublishingTrigger && this.assetPublishingJob && this.asssetPublishingWorkflow) {
        this.assetPublishingTrigger.node.addDependency(this.asssetPublishingWorkflow);
        this.assetPublishingTrigger.node.addDependency(this.assetPublishingJob);
      }
    }
  }

  private createEventBridgeRules(rulesConfig: any): void {
    const ruleNames = Object.keys(rulesConfig);
    for (const ruleName in rulesConfig) {
      const ruleConfig = JSON.parse(JSON.stringify(rulesConfig[ruleName]));
      const bucketNames = ruleConfig.eventPattern?.detail?.bucket?.name;
      let referencedBuckets: s3.Bucket[] = [];
      if (Array.isArray(bucketNames)) {
        ruleConfig.eventPattern.detail.bucket.name = bucketNames.map(
          (logicalName: string) => {
            const bucket = this.bucketMap[logicalName];
            if (bucket) referencedBuckets.push(bucket);
            return bucket?.bucketName || logicalName;
          }
        );
      }
      const eventBridgeRule = create_event_bridge_rule(this, ruleName, rulesConfig[ruleName] as EventBridgeRuleConfig, this.datazoneDomain?.ref);
      if (ruleNames.length > 0 && ruleNames[0] === ruleName){
        this.eventBridgeRuleForAssetMetadataDownload = eventBridgeRule;
      }else if(ruleNames.length > 1 && ruleNames[1] === ruleName){
        this.eventBridgeRuleForAssetPublishion = eventBridgeRule;
      }
      if (this.eventBridgeRuleForAssetPublishion && this.datazoneDomain) {
        this.eventBridgeRuleForAssetPublishion.node.addDependency(this.datazoneDomain);
      }
      if (this.eventBridgeRuleForAssetMetadataDownload && this.lambdaFunction) {
        this.eventBridgeRuleForAssetMetadataDownload.node.addDependency(this.lambdaFunction);
      }
      referencedBuckets.forEach(bucket => {
        if (eventBridgeRule && bucket) {
          eventBridgeRule.node.addDependency(bucket);
        }
      });
    }
  }

  private createDatazoneDomains(domainsConfig: any): void {
    const DomainNames = Object.keys(domainsConfig);
    for (const domainName in domainsConfig) {
      this.datazoneDomain = create_datazone_domain(
        this, 
        domainName, 
        domainsConfig[domainName] as DatazoneDomainConfig,
        this.appVpc,
        { subnets: this.appVpc.privateSubnets }, // Use private subnets with NAT Gateway
        [this.lambdaExecutionSecurityGroup]
      );
      if (this.datazoneDomain && this.AmazonDatazoneDomainExecutionRole){
        this.datazoneDomain.node.addDependency(this.AmazonDatazoneDomainExecutionRole);
      }
      if (DomainNames.length > 0 && DomainNames[0] === domainName) {
        this.datazoneDomainName = this.datazoneDomain.name;
      }
    }
  }

  private createDatazoneUsers(userConfig: any):void {
    const UserNames = Object.keys(userConfig);
    for (const userName in userConfig){
      if (!this.datazoneDomain) {
        console.warn(
          "DataZone Domain has not been created yet. User creation skipped."
        );
      }
      else {
        const datazone_user = create_datazone_user(this, userConfig[userName] as DatazoneUserConfig, this.datazoneDomain.ref);
        this.datazoneUsersMap.set(userName, datazone_user);
        datazone_user.node.addDependency(this.datazoneDomain);
      }
    }
  }

  private createDatazoneBlueprints(blueprintsConfig: any): void {
    if (blueprintsConfig) {
      this.datazoneBlueprint = create_datazone_blueprint(this, blueprintsConfig as DataZoneBlueprintConfig, this.datazoneDomain?.ref, this.bluePrintBucket?.bucketName);
      if (this.datazoneBlueprint && this.datazoneDomain && this.bluePrintBucket) {
        this.datazoneBlueprint.node.addDependency(this.datazoneDomain);
        this.datazoneBlueprint.node.addDependency(this.bluePrintBucket);
      }
    }
  }

  private createDatazoneProjects(projectsConfig: any): void {
    for (const projectName in projectsConfig) {
      if (!this.datazoneDomain) {
        console.warn(
          "DataZone Domain has not been created yet. Project creation skipped."
        );
      }
      else{
        const [project, memberships] = create_datazone_project(this, projectName, projectsConfig[projectName] as ProjectConfig, this.datazoneDomain.ref,this.datazoneUsersMap);
        this.datazoneProject = project;
        this.datazoneProjectMembership = memberships;
        this.datazoneProjectName = this.datazoneProject.name;
        if (this.datazoneProject && this.datazoneDomain && this.datazoneUsersMap) {
          this.datazoneProject.node.addDependency(this.datazoneDomain);
          for (const userProfile of this.datazoneUsersMap.values()) {
            this.datazoneProject.node.addDependency(userProfile);
          }
        }
      }
    }
  }

  private createEnvironmentProfiles(profilesConfig: any): void {
    for (const profileName in profilesConfig) {
      this.environmentProfile = create_environment_profile(this, profileName, profilesConfig[profileName] as EnvironmentProfileConfig, this.datazoneDomain?.ref, this.datazoneBlueprint?.ref, this.datazoneProject?.ref);
      this.environmentProfileName = this.environmentProfile?.name;
      if (this.environmentProfile && this.datazoneBlueprint && this.datazoneProject) {
        this.environmentProfile.node.addDependency(this.datazoneBlueprint);
        this.environmentProfile.node.addDependency(this.datazoneProject);
      }
    }
  }

  private createDatalakeSettings(settingsConfig: any): void {
    if (settingsConfig) {
      this.lakeSettings = create_datalake_settings(this, settingsConfig as DatalakeSettingConfig);
      if (this.lakeSettings && this.AmazonDatazoneGlueManageAccessRole && this.AmazonDatazoneGlueProvisioningRole) {
        this.lakeSettings.node.addDependency(this.AmazonDatazoneGlueManageAccessRole);
        this.lakeSettings.node.addDependency(this.AmazonDatazoneGlueProvisioningRole);
      }
    }
  }

  private createDatazoneEnvironments(environmentsConfig: any): void {
    for (const envName in environmentsConfig) {
      this.datazoneEnvironment = create_datazone_environment(this, envName, environmentsConfig[envName] as DatazoneEnvironmentConfig, this.datazoneDomain?.ref, this.datazoneProject?.ref, this.environmentProfile?.ref);
      this.datazoneEnviromentName = this.datazoneEnvironment?.name;
      if (this.datazoneEnvironment && this.environmentProfile && this.lakeSettings) {
        this.datazoneEnvironment.node.addDependency(this.environmentProfile);
        this.datazoneEnvironment.node.addDependency(this.lakeSettings);
      }
    }
  }

  private createLakeformationResources(resourcesConfig: any): void {
    for (const resourceName in resourcesConfig) {
      const lakeformationRole = iam.Role.fromRoleName(this, 'LakeformationResourceRole', resourcesConfig[resourceName]['roleArn']);
      this.lakeformationResource = create_lakeformation_resource(this, resourceName, resourcesConfig[resourceName] as LakeformationResourceConfig,lakeformationRole);
      if (this.lakeformationResource && this.targetBucket && this.AmazonDatazoneGlueManageAccessRole && this.AmazonDatazoneGlueProvisioningRole) {
        this.lakeformationResource.node.addDependency(this.targetBucket);
        this.lakeformationResource.node.addDependency(this.AmazonDatazoneGlueManageAccessRole);
        this.lakeformationResource.node.addDependency(this.AmazonDatazoneGlueProvisioningRole);
      }
    }
  }

  private createLakeformationPermissions(permissionsConfig: any): void {
    for (const permissionName in permissionsConfig) {
      const qualifier = this.synthesizer.bootstrapQualifier;
      const lakeformationRole = iam.Role.fromRoleName(this, 'LakeformationPermissionRole', permissionsConfig[permissionName]['dataLakePrincipal']['dataLakePrincipalIdentifier']);
      this.lakeformationPermission = create_lakeformation_permission(this, permissionName, permissionsConfig[permissionName] as LakeformationPermissionConfig, qualifier, lakeformationRole);
      if (this.lakeformationPermission && this.targetBucket && this.AmazonDatazoneGlueManageAccessRole && this.AmazonDatazoneGlueProvisioningRole) {
        this.lakeformationPermission.node.addDependency(this.targetBucket);
        this.lakeformationPermission.node.addDependency(this.AmazonDatazoneGlueProvisioningRole);
        this.lakeformationPermission.node.addDependency(this.AmazonDatazoneGlueManageAccessRole);
      }
    }
  }

  private createGlueCrawlers(crawlersConfig: any): void {
    for (const crawlerName in crawlersConfig) {
      this.glueCrawler = create_glue_crawler(this, crawlerName, crawlersConfig[crawlerName] as GlueCrawlerConfig);
      if (this.glueCrawler && this.targetBucket && this.AmazonDatazoneGlueProvisioningRole) {
        this.glueCrawler.node.addDependency(this.targetBucket);
        this.glueCrawler.node.addDependency(this.AmazonDatazoneGlueProvisioningRole);
      }
    }
  }

  private createLambdaFunctions(lambdaConfig: any): void {
    for (const lambdaName in lambdaConfig) {
      this.lambdaFunction = create_lambda_function(this, lambdaName, lambdaConfig[lambdaName] as lambdaFunctionConfig, this.synthesizer.bootstrapQualifier);
    }
  }

  private createSNSTopics(snsConfig: any): void {
    for (const topicName in snsConfig) {
      this.snsTopic = create_sns_topic(this, topicName, snsConfig[topicName] as snsTopicConfig);
    }
  }

  private createOutputs(): void {
    if (this.sourceBucket) {
      new cdk.CfnOutput(this, "source_bucket_name", {
        value: this.sourceBucket.bucketName,
      });
      new cdk.CfnOutput(this, "source_bucket_arn", {
        value: this.sourceBucket.bucketArn,
      });
    }

    if (this.targetBucket) {
      new cdk.CfnOutput(this, "target_bucket_name", {
        value: this.targetBucket.bucketName,
      });
      new cdk.CfnOutput(this, "target_bucket_arn", {
        value: this.targetBucket.bucketArn,
      });
    }

    if (this.glueRole) {
      new cdk.CfnOutput(this, "glue_job_role_name", {
        value: this.glueRole.roleName,
      });
    }

    if (this.glueJob) {
      new cdk.CfnOutput(this, "source_bucket_to_target_bucket_glue_job_name", {
        value: this.glueJob.name!, // Use ! to indicate it's not undefined after creation
      });
    }

    if (this.assetPublishingJob) {
      new cdk.CfnOutput(this, "asset_publishing_glue_job_name", {
        value: this.assetPublishingJob.name!, // Use ! to indicate it's not undefined after creation
      });
    }

    if (this.workflow) {
      new cdk.CfnOutput(this, "asset_creation_glue_workflow_name", {
        value: this.workflow.name!, // Use ! to indicate it's not undefined after creation
      });
    }

    if (this.asssetPublishingWorkflow) {
      new cdk.CfnOutput(this, "asset_publishing_glue_workflow_name", {
        value: this.asssetPublishingWorkflow.name!, // Use ! to indicate it's not undefined after creation
      });
    }

    if (this.trigger) {
      new cdk.CfnOutput(this, "asset_creation_trigger_name", {
        value: this.trigger.name!, // Use ! to indicate it's not undefined after creation
      });
    }

    if (this.assetPublishingTrigger) {
      new cdk.CfnOutput(this, "asset_publishing_trigger_name", {
        value: this.assetPublishingTrigger.name!, // Use ! to indicate it's not undefined after creation
      });
    }

    if (this.eventBridgeRule) {
      new cdk.CfnOutput(this, "event_bridge_rule_name", {
        value: this.eventBridgeRule.ruleName,
      });
    }

    if (this.datazoneDomain) {
      new cdk.CfnOutput(this, "datazone_domain_name", {
        value: this.datazoneDomain.name,
      });

      new cdk.CfnOutput(this, "datazone_domain_id", {
        value: this.datazoneDomain.ref,
      });

      new cdk.CfnOutput(this, "root_domain_id", {
        value: this.datazoneDomain.attrRootDomainUnitId,
      });
    }

    if (this.datazoneBlueprint) {
      new cdk.CfnOutput(this, "datazone_blueprint_name", {
        value: this.datazoneBlueprint.environmentBlueprintIdentifier,
      });

      new cdk.CfnOutput(this, "datazone_blueprint_id", {
        value: this.datazoneBlueprint.ref,
      })
    }

    if (this.datazoneProject) {
      new cdk.CfnOutput(this, "datazone_project_name", {
        value: this.datazoneProject.name,
      });

      new cdk.CfnOutput(this, "datazone_project_id", {
        value: this.datazoneProject.ref,
      })
    }

    if(this.datazoneProjectMembership && this.datazoneProjectMembership.length > 0){
      this.datazoneProjectMembership.forEach((membership: datazone.CfnProjectMembership, index: number) => {
        new cdk.CfnOutput(this, `datazone_project_membership_${index}_id`, {
          value: membership.ref,
        })
      });
    }

    if (this.environmentProfile) {
      new cdk.CfnOutput(this, "datazone_environment_profile_name", {
        value: this.environmentProfile.name,
      });

      new cdk.CfnOutput(this, "datazone_environment_profile_id", {
        value: this.environmentProfile.ref,
      })
    }

    if (this.datazoneEnvironment) {
      new cdk.CfnOutput(this, "datazone_environment_name", {
        value: this.datazoneEnvironment.name,
      });

      new cdk.CfnOutput(this, "datazone_environment_id", {
        value: this.datazoneEnvironment.ref,
      })
    }

    if (this.lakeSettings) {
      // Add relevant outputs for Lake Formation settings if needed
    }

    if (this.lakeformationResource) {
      new cdk.CfnOutput(this, "lakeformation_resource_arn", {
        value: this.lakeformationResource.ref,
      });
    }

    if (this.lakeformationPermission) {
      new cdk.CfnOutput(this, "lakeformation_permission_id", {
        value: this.lakeformationPermission.ref,
      });
    }

    if (this.glueCrawler) {
      new cdk.CfnOutput(this, "glue_crawler_name", {
        value: this.glueCrawler.name!,
      });
    }

    for (const [userName, userProfile] of this.datazoneUsersMap.entries()) {
      new cdk.CfnOutput(this, `${userName}_user_identifier_id`, {
        value: userProfile.userIdentifier,
      });
      new cdk.CfnOutput(this, `${userName}_user_identifier_ref`, {
        value: userProfile.ref,
      });
    }
  }
}
