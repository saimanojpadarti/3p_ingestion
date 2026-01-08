# DZ Asset Listener

This directory contains the AWS Lambda function and associated code to listen for DataZone asset events. When triggered by an EventBridge rule, the lambda processes the event details, extracts asset metadata, and delivers this metadata both to an S3 bucket and to Slack via SNS.

## How It Works
- The Lambda function (`datazone_asset_metadata_download.py`) is triggered by EventBridge rules in response to DataZone asset actions, such as when an asset is added or when metadata generation is accepted.
- It fetches detailed asset metadata from DataZone using Boto3 SDK calls.
- The relevant columns (name, description) are processed into a CSV file using pandas and awswrangler libraries.
- This CSV is uploaded to a DataZone metadata S3 bucket, organized by domain, domain unit, and project.
- A pre-signed S3 URL to the uploaded asset metadata file is generated.
- The URL is published to an SNS topic (`pnp-slack-subscription`), which should be integrated with Slack (via a Lambda or another mechanism subscribed to the topic).

## Dependencies
- `boto3`: Used for AWS API access (DataZone, S3, SNS).
- `pandas` and `awswrangler`: Used to process and write column metadata to S3 in CSV format.

Dependencies are listed in `requirements.txt`.

## Configuration
- The target S3 bucket should follow the naming convention: `pnp-datazone-metadata-bucket-<account_id>-<region>`.
- The SNS topic for notifications must be named (or aliased as) `pnp-slack-subscription`, and must have a subscription to relay messages to Slack.
- This Lambda expects DataZone asset-related events with appropriate detail structure as input (typically triggered from EventBridge rules based on DataZone asset activity).

## Usage
- Deploy this Lambda and associate it with an EventBridge rule for DataZone asset events.
- On relevant events, this function will automate export and sharing of asset metadata with both S3 storage and Slack notifications.

## File List
- `datazone_asset_metadata_download.py`: Main Lambda function implementation.
- `requirements.txt`: Python dependencies to include when packaging the Lambda.

---

Keep this implementation up to date with any changes in how asset events are structured, or in how notifications should be sent to Slack.
