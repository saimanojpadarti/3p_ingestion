import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as events from 'aws-cdk-lib/aws-events';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import { DefaultStackSynthesizer } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { create_bucket, BucketConfig } from './s3-constructs';
import { create_glue_job, create_glue_workflow, create_glue_trigger, create_glue_crawler, GlueConfig, GlueWorkflowConfig, GlueTriggerConfig, GlueCrawlerConfig } from './glue-constructs';
import { create_event_bridge_rule, EventBridgeRuleConfig } from './eventbridge-constructs';
import { create_lakeformation_resource, create_lakeformation_permission, LakeformationResourceConfig, LakeformationPermissionConfig } from './lakeformation-constructs';

/**
 * Creates a full lineage of resources for a DataZone project: S3 buckets, Glue job, workflow, triggers, EventBridge, Lake Formation.
 * @param scope CDK Construct scope
 * @param domainUnitName Name of the domain unit
 * @param projectName Name of the project
 * @param awsAccountId AWS Account ID
 * @param awsRegion AWS Region
 * @param glueProvisioningRoleArn IAM Role ARN for Glue resources
 * @param databaseName Database name created by the datazone environment
 */
export function createProjectLineageResources(
  scope: Construct,
  source_bucket: string,
  doamin_unit_name: string,
  parent_domain_unit_name: string,
  project_name: string,
  awsAccountId: string,
  awsRegion: string,
  glueProvisioningRoleArn: string,
  databaseName: string,
  domainId: string,
  projectId: string,
  schedule_trigger_timing: string,
  entity_type: string
) {
  const qualifier = scope.node.tryGetContext('@aws-cdk/core:bootstrapQualifier') || DefaultStackSynthesizer.DEFAULT_QUALIFIER;
  const domainUnitName = doamin_unit_name.replace(/\s+/g, '_').toLowerCase();
  const projectName = project_name.replace(/\s+/g, '_').toLowerCase();
  const lakeformationRole = iam.Role.fromRoleArn(scope, `LakeformationRole_${domainUnitName}_${projectName}-${entity_type}`, glueProvisioningRoleArn);
  const entityType = parent_domain_unit_name.replace(/\s+/g,'').toLowerCase() + '/' + doamin_unit_name.replace(/\s+/g,'').toLowerCase() + '/' + entity_type;
  
  // 1. S3 Buckets
  const targetBucketName = `target-${source_bucket}`.replace('source-','').toLowerCase();
  const sourceBucket = source_bucket;
  const targetBucket = create_bucket(scope, targetBucketName, { removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true } as BucketConfig, awsAccountId, awsRegion);

  // 2. Glue Job (using glue_scripts/s3_object_copy.py)
  const glueJobName = `gluejob-${domainUnitName}-${projectName}-${entity_type}`;
  const glueJob = create_glue_job(scope, glueJobName, {
    glue_job_type: 'glueetl',
    pythonVersion: '3',
    scriptName: 's3_object_copy.py',
    glue_job_role: cdk.Fn.select(1, cdk.Fn.split('/', glueProvisioningRoleArn)),
    glue_job_arguments: {
      '--SOURCE_BUCKET': sourceBucket,
      '--TARGET_BUCKET': targetBucket.bucketName,
      '--TempDir': `s3://pnp-gluejob-output-bucket-${awsAccountId}-${awsRegion}/temp/`,
      '--job-bookmark-option': 'job-bookmark-enable'
    },
    description: `Copy objects from source to target for ${projectName}`,
    numberOfWorkers: 2,
    timeout: 120,
    workerType: 'G.1X',
    glue_version: '5.0',
    max_concurrent_runs: 1,
    jobRunQueuingEnabled: true
  } as GlueConfig);
  glueJob.node.addDependency(targetBucket);

  // 3. Glue Workflow
  const glueWorkflowName = `workflow-${domainUnitName}-${projectName}-${entity_type}`;
  const glueWorkflow = create_glue_workflow(scope, glueWorkflowName, {
    description: `Workflow for ${projectName}`
  } as GlueWorkflowConfig);

  // 4. Glue Trigger (to start the job in the workflow)
  const glueTriggerName = `trigger-${domainUnitName}-${projectName}-${entity_type}`;
  const glueTrigger = create_glue_trigger(scope, glueTriggerName, {
    type: 'ON_DEMAND',
    actions: [{ jobName: glueJobName }],
    workflow_name: glueWorkflowName,
    startOnCreation: false,
    description: `Trigger for the workflow ${glueWorkflowName}`
  } as GlueTriggerConfig);
  glueTrigger.node.addDependency(glueJob);
  glueTrigger.node.addDependency(glueWorkflow);

  // 4a. schedule trigger (to run everyday)
  const scheduledglueTriggerName = `scheduledtrigger-to-send-${projectName}-${entity_type}-data-to-IPS`;
  const scheduledglueTrigger = create_glue_trigger(scope, scheduledglueTriggerName, {
    type: 'SCHEDULED',
    actions: [
      { 
        jobName: 'glue_job_to_send_datazone_project_data_to_ips',
        arguments: {
          "--source_bucket_name": "pnp-datazone-sql-assets",
          "--project_name": `${project_name}`,
          "--data_bucket_name": targetBucket.bucketName,
          "--mapper_bucket_name": "pnp-ips-mapper-configs",
          "--entity_prefix": `/t4i/pnp/enterprise/peoplemanagement/${entityType}`
        }
      }],
    startOnCreation: true,
    description: `Scheduled Trigger for the job glue_job_to_send_datazone_project_data_to_ips`,
    schedule: `${schedule_trigger_timing}`
  } as GlueTriggerConfig);


  // 4b. Glue Crawler for target bucket
  const glueCrawlerName = `crawler-${domainUnitName}-${projectName}-${entity_type}`;
  const glueCrawler = create_glue_crawler(scope, glueCrawlerName, {
    role: cdk.Fn.select(1, cdk.Fn.split('/', glueProvisioningRoleArn)),
    targets: { s3Targets: { path: targetBucket.bucketName } },
    databaseName: databaseName,
    description: `Crawler for ${targetBucketName}`,
    tablePrefix: `${entity_type}_`
  } as GlueCrawlerConfig);
  glueCrawler.node.addDependency(targetBucket);

  // 4c. Conditional Trigger for Crawler (runs on Glue job success)
  const glueCrawlerTriggerName = `trigger-crawler-${domainUnitName}-${projectName}-${entity_type}`;
  const glueCrawlerTrigger = create_glue_trigger(scope, glueCrawlerTriggerName, {
    type: 'CONDITIONAL',
    actions: [{ crawlerName: glueCrawlerName }],
    workflow_name: glueWorkflowName,
    startOnCreation: true,
    description: `Trigger the crawler for ${projectName}`,
    predicate: {
      conditions: [
        {
          jobName: glueJobName,
          state: 'SUCCEEDED',
          logicalOperator: 'EQUALS'
        }
      ],
    }
  } as GlueTriggerConfig);
  glueCrawlerTrigger.node.addDependency(glueCrawler);
  glueCrawlerTrigger.node.addDependency(glueJob);
  glueCrawlerTrigger.node.addDependency(glueWorkflow);

  // 5. EventBridge Rule (object created in source bucket)
  const eventBridgeRuleName = `rule-${domainUnitName}-${entity_type}`;
  const eventBridgeRule = create_event_bridge_rule(scope, eventBridgeRuleName, {
    eventPattern: {
      source: ['aws.s3'],
      detailType: ['Object Created'],
      detail: {
        bucket: {
          name: [sourceBucket] // [sourceBucket.bucketName]
        }
      }
    },
    description: `Trigger workflow for ${projectName} on object creation`,
    enabled: true, // Set to false to disable the rule by default
    eventBus: 'default',
    targets: [
      {
        action: 'startWorkflowRun',
        service: 'Glue',
        parameters: {
          Name: glueWorkflowName
        }
      }
    ]
  } as EventBridgeRuleConfig, domainId);
//   if (eventBridgeRule){
//     eventBridgeRule.node.addDependency(sourceBucket);
//   };

  // 6. Lake Formation Resource & Permission (for target bucket)
  const lakeformationResource = create_lakeformation_resource(scope, targetBucketName, {
    resourceArn: targetBucket.bucketArn,
    roleArn: glueProvisioningRoleArn,
    useServiceLinkedRole: false,
    hybridAccessEnabled: false, 
    withFederation: false      
  } as LakeformationResourceConfig,lakeformationRole);
  lakeformationResource.node.addDependency(targetBucket);

  const lakeformationPermission = create_lakeformation_permission(scope, `${targetBucketName}-permission`, {
    dataLakePrincipal: {
      dataLakePrincipalIdentifier: glueProvisioningRoleArn
    },
    permissions: [
      'DATA_LOCATION_ACCESS'
    ],
    permissionsWithGrantOption: [],
    resource:{
      dataLocationResource:{
        catalogId: awsAccountId,
        s3Resource: targetBucket.bucketName
      }
    }
  } as LakeformationPermissionConfig, qualifier, lakeformationRole);
  lakeformationPermission.node.addDependency(lakeformationResource);

  return {
    sourceBucket,
    targetBucket,
    glueJob,
    glueWorkflow,
    glueTrigger,
    glueCrawler,
    glueCrawlerTrigger,
    eventBridgeRule,
    lakeformationResource,
    lakeformationPermission
  };
}