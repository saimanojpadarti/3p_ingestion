import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface config{
    config: any;
}

export interface Project {
  name: string;
  description: string;
}

export interface DomainHierarchy {
  domainName: string;
  domainUnits: DomainUnit[];
}

export interface DomainUnit {
  name: string;
  domainUnits: DomainUnit[];
  projects?: Project[];
}

export function loadConfig(file_path: string){
  try {    
    const yamlContent = fs.readFileSync(path.resolve(__dirname, file_path), 'utf8');

    const source_bucket_match = yamlContent.match(/{%\s*set source_bucket_name\s*=\s*"([^"]*)"\s*%}/);
    const target_bucket_match = yamlContent.match(/{%\s*set target_bucket_name\s*=\s*"([^"]*)"\s*%}/);
    const metadata_bucket_match = yamlContent.match(/{%\s*set metadata_bucket_name\s*=\s*"([^"]*)"\s*%}/);
    const domain_name = yamlContent.match(/{%\s*set domain_name\s*=\s*"([^"]*)"\s*%}/);
    const project_name = yamlContent.match(/{%\s*set project_name\s*=\s*"([^"]*)"\s*%}/);
    const job1Match = yamlContent.match(/{%\s*set job1\s*=\s*"([^"]*)"\s*%}/);
    const job2Match = yamlContent.match(/{%\s*set job2\s*=\s*"([^"]*)"\s*%}/);


    const source_bucket = source_bucket_match ? source_bucket_match[1] : null;
    const target_bucket = target_bucket_match ? target_bucket_match[1] : null;
    const metadata_bucket = metadata_bucket_match ? metadata_bucket_match[1] : null;
    const domain = domain_name ? domain_name[1] : null;
    const project = project_name ? project_name[1] : null;
    const job1 = job1Match ? job1Match[1] : null;
    const job2 = job2Match ? job2Match[1] : null;

    let replacedContent = yamlContent;

    // Substitute AWS account ID and region
    const accountId = process.env.CDK_DEFAULT_ACCOUNT || '';
    const region = process.env.CDK_DEFAULT_REGION || '';
    if (accountId) {
      replacedContent = replacedContent.replace(/\{\{\s*account_id\s*\}\}/g, accountId);
    }
    if (region) {
      replacedContent = replacedContent.replace(/\{\{\s*region\s*\}\}/g, region);
    }

    if (source_bucket) {
        replacedContent = replacedContent
          .replace(/{%\s*set source_bucket_name\s*=\s*"[^"]*"\s*%}/g, '')
          .replace(/\{\{\s*source_bucket_name\s*\}\}/g, source_bucket);
      }

    if (target_bucket) {
        replacedContent = replacedContent
        .replace(/{%\s*set target_bucket_name\s*=\s*"[^"]*"\s*%}/g, '')
        .replace(/\{\{\s*target_bucket_name\s*\}\}/g, target_bucket);
    }

    if (metadata_bucket) {
        replacedContent = replacedContent
        .replace(/{%\s*set metadata_bucket_name\s*=\s*"[^"]*"\s*%}/g, '')
        .replace(/\{\{\s*metadata_bucket_name\s*\}\}/g, metadata_bucket);
    }

    if (domain) {
        replacedContent = replacedContent
        .replace(/{%\s*set domain_name\s*=\s*"[^"]*"\s*%}/g, '')
        .replace(/\{\{\s*domain_name\s*\}\}/g, domain);
    }

    if (project) {
        replacedContent = replacedContent
        .replace(/{%\s*set project_name\s*=\s*"[^"]*"\s*%}/g, '')
        .replace(/\{\{\s*project_name\s*\}\}/g, project);
    }


    if (job1) {
      replacedContent = replacedContent
        .replace(/{%\s*set job1\s*=\s*"[^"]*"\s*%}/g, '')
        .replace(/\{\{\s*job1\s*\}\}/g, job1);
    }

    if (job2) {
      replacedContent = replacedContent
        .replace(/{%\s*set job2\s*=\s*"([^"]*)"\s*%}/g, '')
        .replace(/\{\{\s*job2\s*\}\}/g, job2);
    }

    const config = yaml.load(replacedContent) as config | DomainHierarchy;
    //console.log("Configuration read successfully:", JSON.stringify(config, null, 2));
    return config;

  } catch (e) {
    console.error("Error reading or processing config file:", e);
    return null;
  }
}
