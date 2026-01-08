# Config Directory

This directory contains configuration files required for the setup and operation of the DataZone CDK stack. Each file serves a specific role in managing domain hierarchies and basic requirements for the DataZone deployment.

## Files Overview

- **datazone_basic_requirements.yaml**  
  Defines the minimum required configuration and parameters needed for the DataZone environment. This may include user roles, permissions, default settings, or required AWS resources. It specifies resource types and their configurations, directly influencing what components are created during stack deployment.

- **domain_hierarchy.yaml**  
  Specifies the logical or organizational structure of domains within DataZone. Use this file to configure relationships and hierarchies between different domains or data zones for governance and access control. Domain units and structure configured here are critical for organizational segmentation and access boundaries.

## Integration with cdk_stack.ts

- These YAML config files are read programmatically by `cdk_stack.ts` (see the `loadConfig` usage in the stack constructor), and their validity is mandatory for a successful stack deployment.
- The `datazone_basic_requirements.yaml` file drives the creation of cloud resources such as S3 buckets, IAM roles, AWS Glue jobs, DataZone domains, users, blueprints, projects, event bridge rules, and more. Each resource type in the YAML maps directly to a resource creation function in the stack.
- The `domain_hierarchy.yaml` file is specifically used to define the domain structure, including domain units that are created when the stack is synthesized.
- If these config files are missing or misconfigured, major components of the stack may not be created, or deployment can fail altogether.

## Best Practices & Suggestions

- Always ensure config YAMLs adhere to required schemas. Refer to structure and usage in `cdk_stack.ts` and any project documentation for valid syntax and fields.
- Keep these files under version control and review changes before deployment to avoid breaking changes in production environments.
- Consider editing these files with a YAML-aware editor to avoid formatting errors.
- When introducing new resource types or changing structure/fields, review the `cdk_stack.ts` file to confirm the stack supports and correctly processes the new entries.
- Regularly validate the YAML contents to catch misconfigurations early in your development or CI pipeline.

## Usage

Use these YAML files to customize your DataZone deployment according to your organizational requirements. Update them as needed to reflect changes in your domain structure or baseline requirements. All modifications to these files will be materialized during the next stack deployment or update.
