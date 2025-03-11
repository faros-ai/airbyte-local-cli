// TODO: dynamically pull it from docker hub

interface AirbyteTypes {
  destinations: {
    [key: string]: {
      dockerRepo: string;
    };
  };
  sources: {
    [key: string]: {
      dockerRepo: string;
    };
  };
}

export const airbyteTypes: AirbyteTypes = {
  destinations: {
    'databricks-export': {
      dockerRepo: 'airbyte/destination-databricks',
    },
    'databricks-export-test': {
      dockerRepo: 'airbyte/destination-databricks',
    },
    'bigquery-export': {
      dockerRepo: 'airbyte/destination-bigquery',
    },
    faros: {
      dockerRepo: 'farosai/airbyte-faros-destination',
    },
    'postgres-export': {
      dockerRepo: 'airbyte/destination-postgres',
    },
  },
  sources: {
    agileaccelerator: {
      dockerRepo: 'farosai/airbyte-agileaccelerator-source',
    },
    airtable: {
      dockerRepo: 'farosai/airbyte-airtable-source',
    },
    asana: {
      dockerRepo: 'farosai/airbyte-asana-source',
    },
    'azure-repos': {
      dockerRepo: 'farosai/airbyte-azure-repos-source',
    },
    'azure-workitems': {
      dockerRepo: 'farosai/airbyte-azure-workitems-source',
    },
    azureactivedirectory: {
      dockerRepo: 'farosai/airbyte-azureactivedirectory-source',
    },
    azurepipeline: {
      dockerRepo: 'farosai/airbyte-azurepipeline-source',
    },
    backlog: {
      dockerRepo: 'farosai/airbyte-backlog-source',
    },
    bamboohr: {
      dockerRepo: 'farosai/airbyte-bamboohr-source',
    },
    bitbucket: {
      dockerRepo: 'farosai/airbyte-bitbucket-source',
    },
    'bitbucket-server': {
      dockerRepo: 'farosai/airbyte-bitbucket-server-source',
    },
    circleci: {
      dockerRepo: 'farosai/airbyte-circleci-source',
    },
    clickup: {
      dockerRepo: 'farosai/airbyte-clickup-source',
    },
    Datadog: {
      dockerRepo: 'farosai/airbyte-datadog-source',
    },
    datadog: {
      dockerRepo: 'farosai/airbyte-datadog-source',
    },
    docker: {
      dockerRepo: 'farosai/airbyte-docker-source',
    },
    'faros-feeds': {
      dockerRepo: 'farosai/airbyte-faros-feeds-source',
    },
    'faros-graphdoctor': {
      dockerRepo: 'farosai/airbyte-faros-graphdoctor-source',
    },
    'faros-graphql': {
      dockerRepo: 'farosai/airbyte-faros-graphql-source',
    },
    firehydrant: {
      dockerRepo: 'farosai/airbyte-firehydrant-source',
    },
    github: {
      dockerRepo: 'farosai/airbyte-github-source',
    },
    googlecalendar: {
      dockerRepo: 'farosai/airbyte-googlecalendar-source',
    },
    harness: {
      dockerRepo: 'farosai/airbyte-harness-source',
    },
    jenkins: {
      dockerRepo: 'farosai/airbyte-jenkins-source',
    },
    jira: {
      dockerRepo: 'farosai/airbyte-jira-source',
    },
    octopus: {
      dockerRepo: 'farosai/airbyte-octopus-source',
    },
    okta: {
      dockerRepo: 'farosai/airbyte-okta-source',
    },
    opsgenie: {
      dockerRepo: 'farosai/airbyte-opsgenie-source',
    },
    pagerduty: {
      dockerRepo: 'farosai/airbyte-pagerduty-source',
    },
    phabricator: {
      dockerRepo: 'farosai/airbyte-phabricator-source',
    },
    postgres: {
      dockerRepo: 'airbyte/source-postgres',
    },
    servicenow: {
      dockerRepo: 'farosai/airbyte-servicenow-source',
    },
    sheets: {
      dockerRepo: 'farosai/airbyte-sheets-source',
    },
    shortcut: {
      dockerRepo: 'farosai/airbyte-shortcut-source',
    },
    squadcast: {
      dockerRepo: 'farosai/airbyte-squadcast-source',
    },
    statuspage: {
      dockerRepo: 'farosai/airbyte-statuspage-source',
    },
    testrails: {
      dockerRepo: 'farosai/airbyte-testrails-source',
    },
    trello: {
      dockerRepo: 'farosai/airbyte-trello-source',
    },
    tromzo: {
      dockerRepo: 'farosai/airbyte-tromzo-source',
    },
    vanta: {
      dockerRepo: 'farosai/airbyte-vanta-source',
    },
    victorops: {
      dockerRepo: 'farosai/airbyte-victorops-source',
    },
    workday: {
      dockerRepo: 'farosai/airbyte-workday-source',
    },
    xray: {
      dockerRepo: 'farosai/airbyte-xray-source',
    },
    zendesk: {
      dockerRepo: 'airbyte/source-zendesk-support',
    },
    bigquery: {
      dockerRepo: 'airbyte/source-bigquery',
    },
  },
};
