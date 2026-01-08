import * as cdk from 'aws-cdk-lib';
import { Size } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs'
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs'; 
import * as path from 'path';

const PANDAS_LAYER_ARN = 'arn:aws:lambda:us-west-2:336392948345:layer:AWSSDKPandas-Python313:3';

function getPandasLayer(scope: Construct) {
    return lambda.LayerVersion.fromLayerVersionArn(
        scope,
        'PandasLayer',
        PANDAS_LAYER_ARN
    );
}


export interface lambdaFunctionConfig {
    handler: string;
    runtime: lambda.Runtime;
    code_dir: string;
    vpc?: string;
    vpc_subnets?: string[];
    security_groups?: string[];
    layers?: lambda.ILayerVersion[];
    memorySize?: number;
    timeout?: cdk.Duration;
    role?: any;
}



export function create_lambda_function(scope: Construct, lambda_name:string, function_config:lambdaFunctionConfig, bootstrapQualifier: any){

    let vpc: ec2.IVpc | undefined;
    let selectedSubnets: ec2.SubnetSelection | undefined;
    let securityGroups: ec2.ISecurityGroup[] | undefined;
    let lambdaExecutionRole: any | undefined;
    
    if (function_config.vpc){
        vpc = ec2.Vpc.fromLookup(scope, 'default-vpc', {
        vpcId: function_config.vpc,
        });

        if (function_config.vpc_subnets && function_config.vpc_subnets.length > 0){
            selectedSubnets = {
                subnets: function_config.vpc_subnets.map((subnetId, index) =>
                    ec2.Subnet.fromSubnetId(scope,`subnet-${lambda_name}-${index}`, subnetId)
            ),
            };
        } else {
            selectedSubnets = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };
        }

        if (function_config.security_groups && function_config.security_groups.length > 0) {
            securityGroups = function_config.security_groups.map((sgId, index) =>
                ec2.SecurityGroup.fromLookupById(scope, `SG-${lambda_name}-${index}`, sgId)
            );
        }
    }

    if (function_config.role){
        lambdaExecutionRole = function_config.role;
    }else {
        lambdaExecutionRole = iam.Role.fromRoleArn(scope,`lambda-${lambda_name}`,`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-${bootstrapQualifier}-cfn-exec-role-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`)
    }

    // Create the log group before the Lambda function
    const logGroup:logs.LogGroup = new logs.LogGroup(scope, `LogGroup-${lambda_name}`, {
      logGroupName: `/aws/lambda/${lambda_name}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_YEAR, // optional
    });

    const Lambdafunction = new lambda.Function(scope, `lambda-function-${lambda_name}`,{
        runtime: lambda.Runtime.PYTHON_3_13,
        handler: function_config.handler,
        code: lambda.Code.fromAsset(path.join(__dirname, function_config.code_dir)),
        vpc: vpc,
        vpcSubnets: selectedSubnets,
        securityGroups: securityGroups,
        role: lambdaExecutionRole,
        functionName: lambda_name,
        timeout: cdk.Duration.seconds(15),
        memorySize: function_config.memorySize ?? 256,
        layers: [getPandasLayer(scope), ...(function_config.layers ?? [])],
        logGroup: logGroup
    });

    // Ensure Lambda is created after the log group
    Lambdafunction.node.addDependency(logGroup);

    return Lambdafunction; 
}