# Mapper Configs Directory

This directory contains configuration CSV files used for mapping data fields for various projects.

## File Naming Convention

Each CSV file should be named with the project name converted to snake_case and suffixed with `_mapper_config.csv`. For example, if the project name is:

```
time away data ingestion
```

The corresponding config file should be named:

```
time_away_data_ingestion_mapper_config.csv
```

## Purpose
These config files define field mappings and other configuration required for each project's ingestion or processing logic.

## Adding a New Config File
1. Convert your project name to snake_case.
2. Name your file following the format:
   
   `<project_name_in_snake_case>_mapper_config.csv`
3. Place the file in this directory.
4. Document important details as comments at the top of your CSV if needed.

---

For additional information or examples, contact the repository maintainer.