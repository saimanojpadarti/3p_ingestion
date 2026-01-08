# AWS DataZone CDK Data Platform

This repository contains an AWS Cloud Development Kit (CDK) project for provisioning a comprehensive, automated data platform, with a primary focus on **AWS DataZone**. The stack is designed to be highly modular and scalable, automating the creation of various AWS resources, data pipelines, and governance mechanisms.

## Project Overview

The project leverages CDK to define infrastructure as code, which is organized into reusable constructs. This approach ensures that all components of the data platform, from S3 buckets to Glue jobs and DataZone domains, are provisioned in a consistent and reproducible manner. The core functionality includes:

  * **Automated Data Ingestion**: Event-driven pipelines, orchestrated by AWS Glue and EventBridge, automatically process and move data.
  * **Data Governance**: AWS DataZone is used to manage and govern data assets, including a defined domain hierarchy, user permissions, and asset metadata.
  * **Centralized Logging and Monitoring**: The stack includes configurations for logging and monitoring key services.
  * **Custom Resources**: Custom Lambda functions are used to manage DataZone policies that are not yet natively supported by CDK, ensuring full automation of the deployment.

## Directory Structure

The project's code is organized into a `lib` directory, where each subdirectory serves a specific purpose:

  - **`config`**: Contains YAML files that define the stack's configurations, including IAM roles, S3 buckets, Glue jobs, and the DataZone domain hierarchy.
  - **`custom-resources`**: Houses custom CDK constructs that use a shared Lambda function to perform DataZone policy grants.
  - **`datazone-dependables`**: Includes a core utility function that programmatically generates all necessary infrastructure (Glue jobs, S3 buckets, Lake Formation permissions) for each DataZone project defined in the configuration.
  - **`dz_asset_listner`**: A dedicated Python package for an AWS Lambda function that listens for DataZone asset events and publishes metadata to S3 and a Slack channel via SNS.
  - **`eventbridge-constructs`**: Defines a reusable construct for creating and managing EventBridge rules.
  - **`glue-constructs`**: Provides modular constructs for provisioning Glue jobs, workflows, triggers, connections, and crawlers.
  - **`glue_scripts`**: Contains the Python scripts executed by the Glue jobs, which handle data processing and API integrations.
  - **`iam-constructs`**: Manages the creation and configuration of IAM roles and policies.
  - **`lambda`**: Holds the Python code for the custom Lambda function used by the custom resources.
  - **`lakeformation-constructs`**: Contains constructs for managing Lake Formation settings, resources, and permissions.
  - **`mapper_configs`**: Stores CSV files for data field mapping, used by the Glue jobs.
  - **`s3-constructs`**: Defines a construct for creating and configuring S3 buckets with specific properties.
  - **`sns-constructs`**: Manages the creation of SNS topics for notifications.
  - **`sql_scripts`**: Contains SQL queries in a structured CSV format for database interactions.
  - **`vended-constructs`**: A placeholder for pre-generated CDK constructs.

## Getting Started

### Prerequisites

  - [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) installed and configured.
  - [Node.js](https://nodejs.org/) and [npm](https://www.google.com/search?q=https://www.npmjs.com/) installed.
  - An AWS account with appropriate permissions.

### Deployment

1.  **Install dependencies**:

    ```sh
    npm install
    ```

2.  **Bootstrap the CDK environment**: If this is your first time using CDK in this account/region, bootstrap it.

    ```sh
    cdk bootstrap
    ```

3.  **Deploy the stack**:

    ```sh
    cdk deploy
    ```

4.  **Review the Outputs**: After deployment, the stack will output key resource names, IDs, and ARNs that you can use to interact with your new data platform.

### Configuration

Customize the deployment by modifying the YAML files in the `lib/config` directory:

  - `datazone_basic_requirements.yaml`: Edit this file to configure IAM roles, S3 buckets, and other foundational resources.
  - `domain_hierarchy.yaml`: Define your organizational structure, including domain units and projects, which the CDK stack will automatically provision.

-----

For detailed information on each component, please refer to the `README.md` files within the respective subdirectories.