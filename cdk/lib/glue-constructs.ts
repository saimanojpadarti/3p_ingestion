import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as assets from 'aws-cdk-lib/aws-s3-assets';
import * as path from 'path';
import { Construct } from 'constructs';
import { CfnConnection } from 'aws-cdk-lib/aws-events';
// import { GlueClient, GetJobCommand, GetJobCommandOutput } from "@aws-sdk/client-glue";

export interface GlueConfig {
    glue_job_type?: string,
    pythonVersion?: string,
    runtime?: any,
    scriptName?: string,
    glue_job_role: string,
    //below are optional
    allocatedCapacity?: number,
    connections?: string[],
    glue_job_arguments: any,
    description?: string,
    executionClass?: string,
    max_concurrent_runs?: number,
    glue_version?: string,
    jobMode?: string,
    jobRunQueuingEnabled?: boolean,
    logUri?: string,
    maintenanceWindow?: string,
    maxCapacity?: number,
    maxRetries?: number,
    nonOverridableArguments?: any,
    notifyDelayAfter?: number,
    numberOfWorkers?: number,
    securityConfiguration?: string,
    tags?: any,
    timeout?: number,
    workerType?: string,
}

export interface GlueConnectionConfig{
  connectionType: string;
  physicalConnectionRequirements: physicalConnectionRequirementProperty;
  name: string;
}

export interface physicalConnectionRequirementProperty{
  availabilityZone: string;
  securityGroupIdList: string[],
  subnetId: string;
}

export interface GlueWorkflowConfig {
    defaultRunProperties?: any,
    description?: string,
    maxConcurrentRuns?: number,
    tags?: any,
}
  
  export interface GlueTriggerConfig {
    actions: GlueTriggerAction[]; 
    type: string;
    description?: string;
    startOnCreation?: boolean;
    workflow_name?: string;
    eventBatchingCondition?: any; 
    predicate?: any;
    schedule?: string;
    tags?: any;
}
  
export interface GlueTriggerAction {
    jobName: string;
    arguments?: any; // Add specific types if you use these
    crawlerName?: string;
    notificationProperty?: any;
    securityConfiguration?: string;
    timeout?: number;
}

export interface GlueCrawlerConfig {
    role: string;
    targets: GlueTargetProperty;
    databaseName: string;
    description: string;
    tablePrefix: string;
}

export interface GlueTargetProperty {
    s3Targets: s3TargetProperty;
}

export interface s3TargetProperty {
    path: string;
}

export function  create_glue_job(scope: Construct, jobName: string, jobConfig: GlueConfig, connection?: glue.CfnConnection) {
    // Assuming the IAM role for the Glue job has already been created
    const glueJobRole = iam.Role.fromRoleName(scope, `GlueJobRoleRef_${jobName}`, jobConfig.glue_job_role);

    // Construct the script location in S3
    const scriptAsset = new assets.Asset(scope, `GlueScriptAsset_${jobName}`, {
        path: path.join(__dirname, `glue_scripts/${jobConfig.scriptName}`),
    });
    const scriptLocation = `s3://${scriptAsset.s3BucketName}/${scriptAsset.s3ObjectKey}`;

    const glueJob =  new glue.CfnJob(scope, `GlueJob_${jobName}`, {
        name: jobName,
        role: glueJobRole.roleArn,
        command: {
        name: jobConfig.glue_job_type,
        pythonVersion: jobConfig.pythonVersion,
        scriptLocation: scriptLocation
        },
        defaultArguments: {
        ...jobConfig.glue_job_arguments,
        },
        allocatedCapacity: jobConfig.allocatedCapacity,
        connections: connection ? { connections: [connection.ref] } : undefined,
        description: jobConfig.description,
        executionClass: jobConfig.executionClass,
        executionProperty: {
        maxConcurrentRuns: jobConfig.max_concurrent_runs,
        },
        glueVersion: jobConfig.glue_version,
        jobMode: jobConfig.jobMode,
        jobRunQueuingEnabled: jobConfig.jobRunQueuingEnabled,
        logUri: jobConfig.logUri,
        maintenanceWindow: jobConfig.maintenanceWindow,
        maxCapacity: jobConfig.maxCapacity,
        maxRetries: jobConfig.maxRetries,
        nonOverridableArguments: jobConfig.nonOverridableArguments,
        notificationProperty: jobConfig.notifyDelayAfter ? {notifyDelayAfter: jobConfig.notifyDelayAfter}: undefined,
        numberOfWorkers: jobConfig.numberOfWorkers,
        securityConfiguration: jobConfig.securityConfiguration,
        tags: jobConfig.tags,
        timeout: jobConfig.timeout,
        workerType: jobConfig.workerType,
    });
    // glueJob.applyRemovalPolicy(RemovalPolicy.RETAIN);
    return glueJob
}

export function create_glue_workflow(scope: Construct, workflowName: string, work_flow_config:GlueWorkflowConfig){
    const workflow = new glue.CfnWorkflow(scope, `GlueWorkflow_${workflowName}`, {
      name: workflowName,
      defaultRunProperties: work_flow_config.defaultRunProperties,
      description: work_flow_config.description,
      maxConcurrentRuns: work_flow_config.maxConcurrentRuns,
      tags: work_flow_config.tags,
    });
    return workflow;
}

export function create_glue_connecstion(scope: Construct, connectionConfig: GlueConnectionConfig){
  const connection = new glue.CfnConnection(scope, `GlueConnection`,{
    catalogId: cdk.Aws.ACCOUNT_ID,
    connectionInput: {
      connectionType: connectionConfig.connectionType,
      name: connectionConfig.name,
      physicalConnectionRequirements:{
        availabilityZone: connectionConfig.physicalConnectionRequirements.availabilityZone,
        securityGroupIdList: connectionConfig.physicalConnectionRequirements.securityGroupIdList,
        subnetId: connectionConfig.physicalConnectionRequirements.subnetId
      }
    },
  });
  return connection;
}

export function create_glue_trigger(scope: Construct, triggerName:string, trigger_config: GlueTriggerConfig){
    const trigger = new glue.CfnTrigger(scope, `GlueTrigger_${triggerName}`, {
      name: triggerName,
      type: trigger_config.type,
      actions: trigger_config.actions.map(action => ({
        jobName: action.jobName,
        arguments: action.arguments,
        crawlerName: action.crawlerName,
        notificationProperty: action.notificationProperty,
        securityConfiguration: action.securityConfiguration,
        timeout: action.timeout,
      })),
      description: trigger_config.description,
      startOnCreation: trigger_config.startOnCreation,
      workflowName: trigger_config.workflow_name,
      eventBatchingCondition: trigger_config.eventBatchingCondition,
      predicate: trigger_config.predicate,
      schedule: trigger_config.schedule,
      tags: trigger_config.tags,
    });
    return trigger;
}

export function create_glue_crawler(scope: Construct,crawlerName: string, crawler_config: GlueCrawlerConfig){
    const role = iam.Role.fromRoleName(scope, `GlueCrawlerRole_${crawlerName}`, crawler_config.role);
    const glueCrawler = new glue.CfnCrawler(scope, `GlueCrawler_${crawlerName}`, {
      name: crawlerName,
      role: role.roleArn,
      databaseName: crawler_config.databaseName.replace(/\s/g, '').toLowerCase(),
      description: crawler_config.description,
      targets: {
        s3Targets: [
          {
            path: `s3://${crawler_config.targets.s3Targets.path}/`
          }
        ]
      },
      tablePrefix: crawler_config.tablePrefix,
      configuration: JSON.stringify({
        // Version of the configuration
        Version: 1.0,
        // Controls how the crawler groups files into tables
        Grouping: {
          TableLevelConfiguration: 1,
          TableGroupingPolicy: "CombineCompatibleSchemas"
        },
        // Whether to automatically create partition indexes
        CreatePartitionIndex: false // default is true
        // You can add CsvClassifier, JsonClassifier, XmlClassifier, ParquetClassifier, ConnectionName, etc. as needed
      }),
    });
    return glueCrawler;
}