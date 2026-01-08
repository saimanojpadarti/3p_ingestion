import * as kms from "aws-cdk-lib/aws-kms";
import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface snsTopicConfig {
  displayName: string;
}

export function create_sns_topic(
  scope: Construct,
  topicName: string,
  snsTopicConfig: snsTopicConfig
){
  const topic = new sns.Topic(scope, `snsTopic_${topicName}`, {
    displayName: snsTopicConfig.displayName,
    topicName: 'pnp-slack-subscription',
    masterKey: kms.Alias.fromAliasName(scope, "defaultKey", "alias/aws/sns"),
  });

  new sns.Subscription(scope, `snsTopicSubscription_${topicName}`, {
    topic: topic,
    protocol: sns.SubscriptionProtocol.EMAIL,
    endpoint:
      "3p-data-ingestion-dat-aaaaq7ef7wz2dtcu4ggsw55y5q@intuit.org.slack.com",
  });
  return topic;
}