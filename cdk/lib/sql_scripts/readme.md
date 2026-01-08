# SQL Scripts

This directory contains SQL scripts required for table or data generation.

## File Format and Naming
- Write your SQL script in a CSV file.
- The CSV header must be:
  
  ```
  database_name,table_name,sql_query
  ```
- Each CSV file should contain only one record (one data row) with the following fields filled:
  - `database_name`: Name of the database.
  - `table_name`: Name of the view or table being created or queried.
  - `sql_query`: The full SQL query as a single string (escape newlines as needed for CSV).

## Example

```
database_name,table_name,sql_query
analytics_db,sales,"SELECT region, SUM(amount) AS total_sales FROM sales GROUP BY region;"
```

## Guidelines
- Only one (header + one data row) per CSV file.
- Each SQL (CSV) file must be placed within a subdirectory named after the corresponding project. For example, if the project name is "time away data ingestion", create a subdirectory called `time_away_data_ingestion` and place the SQL there.
- Name each file as its project entitiy `entityName_sql.csv`, where `entityName` is the name of the project entity or logical entity (e.g., `employeeTimeOff_sql.csv`).
- Example: For "Time Away Data Ingestion", place your SQL file as `time_away_data_ingestion/employeeTimeOff_sql.csv`.
- Ensure your SQL is valid and tested before adding to the repository.

For further guidelines or questions, consult the repository maintainer.