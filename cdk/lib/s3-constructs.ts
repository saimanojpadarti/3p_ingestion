import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cdk from 'aws-cdk-lib';

export interface BucketConfig {
    encryption?: s3.BucketEncryption;
    enforceSSL?: boolean;
    lifecycleRules?: s3.LifecycleRule[];
    blockPublicAccess?: s3.BlockPublicAccess;
    removalPolicy?: cdk.RemovalPolicy;
    eventBridgeEnabled?: boolean;
}

export function create_bucket(scope: Construct, bucket_name: string, bucket_config: BucketConfig, account_id?: string, account_region?: string){
    const bucket = new s3.Bucket(scope,`logical_id_${bucket_name}`,{
      bucketName: account_id && account_region ? `${bucket_name}-${account_id}-${account_region}` : bucket_name,
      encryption: bucket_config?.encryption ?? s3.BucketEncryption.S3_MANAGED,
      enforceSSL: bucket_config?.enforceSSL ?? true,
      // resource deletion after running cdk destroy
      removalPolicy: bucket_config?.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
      //life cycle configuration
      lifecycleRules: bucket_config?.lifecycleRules ?? [
        {
          id: 'delete-old-files',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
      blockPublicAccess: bucket_config?.blockPublicAccess ?? {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true
      },
      eventBridgeEnabled: bucket_config?.eventBridgeEnabled ?? false
    } );
    return bucket;
}