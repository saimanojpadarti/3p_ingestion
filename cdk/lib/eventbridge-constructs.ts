import * as cdk from 'aws-cdk-lib';
import * as aws_events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs'; 

export interface EventBridgeRuleConfig {
    eventBus?: string; // Optional: If you're using a custom event bus
    eventPattern: EventPattern;
    description?: string;
    enabled?: boolean;
    targets: EventBridgeTarget[];
}
  
export interface EventPattern {
    source: string[];
    detailType?: string[];
    detail?: Record<string, any>; // Adjust scope if you have a known structure for 'detail'
}
  
export interface EventBridgeTarget {
    action: string;
    service: string;
    parameters: Record<string, string>; // Adjust scope if you have a known structure for parameters
}

export function create_event_bridge_rule(scope: Construct, rule_name:string, rule_config:EventBridgeRuleConfig, dominId:string | undefined){
    let detail: any;
    const source:any = rule_config.eventPattern.source[0];
    if (source === 'aws.datazone'){
      if (!dominId){
        console.warn("DataZone Domain ID or Project ID is not available. EventBridge Rule creation skipped.");
        return undefined;
      }
      detail = {
        metadata: {
          domain:[dominId]
        }
      }    
    }
    else{
      detail = rule_config.eventPattern.detail
    }
    const rule = new aws_events.Rule(scope, `EventBridgeRule_${rule_name}`, {
      ruleName: rule_name,
      description: rule_config.description,
      eventPattern: {
        source: rule_config.eventPattern.source,
        detailType: rule_config.eventPattern.detailType,
        detail: detail,
      },
      eventBus: rule_config.eventBus
      ? aws_events.EventBus.fromEventBusName(scope, `EventBus_${rule_name}`, rule_config.eventBus)
      : undefined,
      targets: rule_config.targets.map(target => createEventBusTarget(scope,target))
    });
    return rule; 
}

export function createEventBusTarget(scope: Construct, target: EventBridgeTarget): aws_events.IRuleTarget{
    switch (target.service){
      case 'Glue':
        if (target.action === 'startWorkflowRun'){
          return new aws_events_targets.AwsApi({
            service: target.service,
            action: target.action,
            parameters: target.parameters
          })
        }
      case 'Lambda':
        if (target.action === 'invokeLambdaFunction'){
          let lambdaFunction: lambda.IFunction;
          lambdaFunction = lambda.Function.fromFunctionName(scope, `event-trigger-function-${target.parameters?.Name}`, target.parameters?.Name);
          return new aws_events_targets.LambdaFunction(lambdaFunction);
        }
      default:
        throw new Error(`Unsupported service: ${target.service}`);
    }
}