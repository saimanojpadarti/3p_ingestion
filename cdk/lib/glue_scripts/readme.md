# Glue Scripts

This directory contains AWS Glue ETL scripts used to provision and manage Glue jobs as part of the DataZone infrastructure. Glue jobs are dynamically created based on your configuration files: both a generic Glue job and project-specific Glue jobs (per project defined in your domain hierarchy).

## Glue Job Provisioning Overview

### 1. Generic Glue Job
- A generic job (typically named `glue_job_to_send_datazone_project_data_to_ips`) is defined in `datazone_basic_requirements.yaml`.
- This job is invoked per project using scheduled triggers and orchestrates sending consolidated data to target systems (such as IPS).
- Its arguments are populated based on project context (mapper config bucket, project name, entity prefix, etc.).

### 2. Per-Project Glue Jobs
- For each project listed in `domain_hierarchy.yaml`, a dedicated Glue job is created using the project and domain unit names as part of the Glue job name.
- These jobs typically use the `s3_object_copy.py` script to copy data from source to target S3 buckets within the project context.
- Project-specific triggers, crawlers, workflows, and event rules are also provisioned alongside each job, ensuring fully automated, event-driven data movement per project.
- Logic for dynamic per-project creation and scheduling is managed in the CDK files (see `datazone_dependables.ts`).

## Scripts
- `s3_object_copy.py`: Generic script for copying S3 objects as part of project Glue jobs.
- Any additional scripts should follow the same structure to support drop-in replacement or new jobs as needed.

## Integration and Dynamic Creation
- Glue jobs are not statically defined, but are created by the CDK stack at deploy-time, based on the resource and project definitions in your configuration YAML files:
  - **`datazone_basic_requirements.yaml`**: Provides job type(s), script names, IAM role ARNs, and common generic job arguments.
  - **`domain_hierarchy.yaml`**: Enumerates projects. For each project, all necessary Glue and dependent resources are generated.
- For implementation details, refer to [`datazone_dependables.ts`](../datazone-dependables.ts), especially the `createProjectLineageResources` function.

## Extending/Customizing
- To add new Glue jobs, update the `datazone_basic_requirements.yaml` and provide new scripts here following the template of `s3_object_copy.py`.
- New or enhanced per-project behaviors can be implemented by customizing the scripts or by extending the logic in the CDK stack and related TypeScript files.

## Best Practices
- Always keep your scripts compatible with the job arguments defined in the stack to ensure smooth integration.
- Maintain version control on this directory so changes are reflected and reproducible across environments.
- Test scripts independently before deployment to AWS Glue.

---

This structure ensures a scalable and maintainable approach for automated per-project and generic data processing jobs within the DataZone ecosystem.
