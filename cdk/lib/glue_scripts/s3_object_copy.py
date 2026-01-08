import sys
import boto3
import datetime
from pyspark.sql import SparkSession
from pyspark.sql.functions import year, month, dayofmonth, lit, col
from pyspark.sql.types import LongType, TimestampType, StructType, StructField
from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.utils import getResolvedOptions
from awsglue.dynamicframe import DynamicFrame

# Get job arguments
args = getResolvedOptions(sys.argv, ['JOB_NAME', 'SOURCE_BUCKET', 'TARGET_BUCKET'])

# Initialize Spark and Glue contexts
spark = SparkSession.builder.appName("S3CopyJob").getOrCreate()
glueContext = GlueContext(spark.sparkContext)
job = Job(glueContext)
job.init(args['JOB_NAME'], args)

# Define source and target buckets
source_bucket = args['SOURCE_BUCKET']
target_bucket = args['TARGET_BUCKET']
# metadata_bucket = args['METADATA_BUCKET']
database_name = 'default'
batch_metadata_table = 'test_table_1'

# Define source S3 path
source_path = f"s3://{source_bucket}/"

# Generate a unique batch_id based on the current job execution timestamp.
# This batch_id will be applied to all new files processed in this run.
batch_id = int(datetime.datetime.now().timestamp())
execution_timestamp = datetime.datetime.fromtimestamp(batch_id)

print(f"Job started with batch_id: {batch_id} and execution_timestamp: {execution_timestamp}")

# Read CSV files from S3 with Glue job bookmarking enabled.
# This dynamic_frame will ONLY contain new files that have been added
# or modified since the last successful job run.
dynamic_frame = glueContext.create_dynamic_frame.from_options(
    connection_type="s3",
    connection_options={
        "paths": [source_path],
        "recurse": True  # Recursively read subfolders
    },
    transformation_ctx='input_objects', # Unique context for job bookmarking
    format="csv",
    format_options={"withHeader": True}
)

if dynamic_frame.count() == 0:
    print("No new files found to process. Committing job bookmark and exiting.")
    job.commit() # Important to commit even if no new files, to update bookmark state
else:
    # Convert the DynamicFrame (containing only new records) to a Spark DataFrame for transformations.
    df = dynamic_frame.toDF()
    
    # Add `upload_time` (representing the job's processing time) and partition columns.
    # The year, month, and day will be derived from this `execution_timestamp`.
    df = df.withColumn("upload_time", lit(execution_timestamp).cast(TimestampType()))
    df = df.withColumn("year", year(col("upload_time")))
    df = df.withColumn("month", month(col("upload_time")))
    df = df.withColumn("day", dayofmonth(col("upload_time")))
    
    # Define target S3 path for the processed data
    target_path = f"s3://{target_bucket}/"
    
    # Write the processed data to the target S3 path, partitioned by year, month, day, and batch_id.
    # Since `df` now only contains new records (due to job bookmarking), only these new records
    df.write.partitionBy("year", "month", "day").mode("append").option("header", "true").csv(target_path)
    
    # Commit job bookmark to ensure that these files are not re-processed in future runs.
    job.commit()
    print("Glue job completed successfully, processing only new files.")