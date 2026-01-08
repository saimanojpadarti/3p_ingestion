# Lambda (Temporary Custom Resource for DataZone Policy Grants)

This directory contains a temporary custom AWS Lambda resource for granting and revoking permissions (policy grants) to DataZone resources. It is designed as a workaround for a missing feature in AWS CDK (as of version 2.200.0), which does not currently provide a native construct to automate these DataZone policy grants within your stack definition.

## Context & Purpose
- **Why it exists:** CDK 2.200.0 and prior versions do not offer constructs for DataZone permission granting. To automate and fully manage infrastructure, this custom Lambda acts as a CloudFormation custom resource for assigning/removing policy grants on DataZone entities.
- **How it works:**
  - The Lambda function (datazone_policy_grant_handler.py) handles Create, Update, and Delete events from CloudFormation.
  - Based on input properties (domain, project, entity, principal, policy type, etc.), it calls the relevant AWS DataZone API (add_policy_grant or remove_policy_grant).
  - It signals CloudFormation on success or failure using cfnresponse.
- **Temporary workaround:** This directory and its Lambda custom resource should be removed as soon as AWS provides a proper construct for these operations.

## Main Functionality
- Receives resource details and desired policy grant as CloudFormation event properties.
- Adds or removes DataZone policy grants for IAM users, roles, groups, and various DataZone entity types (project, domain unit, asset type, etc.).
- Supports exponential backoff/retries for AWS API operations.
- Logs all operations and results for transparency and troubleshooting.
- Properly responds to CloudFormation to prevent stack hangs.

## Structure
- `datazone_policy_grant_handler.py`: Lambda function implementation.
- `cfnresponse.py`: Helper for CloudFormation custom resource signaling.
- `requirements.txt`: List of Python dependencies (include boto3, etc.).
- `__init__.py`: Python package marker.

## Best Practices & Transition
- **Temporary only:** Remove this Lambda and supporting files once AWS releases CDK constructs for DataZone policy grants matching your workflows. Review release notes for CDK and update your stack to the preferred native approach when available.
- **Audit trails:** Because these custom grants impact security, ensure CloudTrail and logging are enabled for auditability.
- **Testing:** Test CloudFormation operations with this custom resource for expected grant/revoke behaviors before production deployment.

---

_For now, this directory enables automated, policy-driven creation of DataZone resources in your stack. Remove and migrate to an official construct as soon as one is available to improve maintainability and security alignment._
