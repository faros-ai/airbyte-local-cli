interface StaticAirbyteConfig {
  destinations: {
    [key: string]: {
      image: string;
      config: object;
    };
  };
  sources: {
    [key: string]: {
      image: string;
      config: object;
    };
  };
}

export const staticAirbyteConfig: StaticAirbyteConfig = {
  destinations: {
    faros: {
      image: 'farosai/airbyte-faros-destination',
      config: {
        edition_configs: {
          api_key: '<UPDATE_YOUR_FAROS_API_KEY>',
          edition: 'cloud',
        },
      },
    },
  },
  sources: {
    github: {
      image: 'farosai/airbyte-github-source',
      config: {
        authentication: {
          type: 'token',
          personal_access_token: '<UPDATE_YOUR_GITHUB_TOKEN>',
        },
        organizations: ['<UPDATE_MY_ORG_1>', '<UPDATE_MY_ORG_2>'],
      },
    },
    gitlab: {
      image: 'farosai/airbyte-gitlab-source',
      config: {
        authentication: {
          type: 'token',
          personal_access_token: '<UPDATE_YOUR_CREDENTIAL>',
        },
      },
    },
    jira: {
      image: 'farosai/airbyte-jira-source',
      config: {
        url: 'https://<UPDATE_YOUR_DOMAIN>.atlassian.net',
        username: '<UPDATE_YOUR_JIRA_USER_EMAIL>',
        password: '<UPDATE_YOUR_JIRA_TOKEN>',
      },
    },
    azure: {
      image: 'farosai/airbyte-azure-repos-source',
      config: {
        access_token: '<UPDATE_YOUR_AZURE_TOKEN>',
        organization: '<UPDATE_YOUR_ORG>',
      },
    },
    bitbucket: {
      image: 'farosai/airbyte-bitbucket-source',
      config: {
        token: '<UPDATE_BITBUCKET_TOKEN>',
        workspaces: ['<UPDATE_WORKSPACE_1>', '<UPDATE_WORKSPACE_2>'],
      },
    },
    buildkite: {
      image: 'farosai/airbyte-faros-feeds-source',
      config: {
        feed_cfg: {
          feed_name: 'buildkite-feed',
          token: '<UPDATE_BUILDKITE_TOKEN>',
          organization: '<UPDATE-BUILDKITE-ORG>',
        },
      },
    },
    circleci: {
      image: 'farosai/airbyte-circleci-source',
      config: {
        token: '<UPDATE_CIRCLECI_TOKEN>',
        project_slugs: ['vcs-slug/org-name/repo-name-1'],
      },
    },
    jenkins: {
      image: 'farosai/airbyte-jenkins-source',
      config: {
        server_url: '<UPDATE_JENKINS_URL>',
        user: '<UPDATE_JENKINS_USER>',
        token: '<UPDATE_JENKINS_TOKEN>',
      },
    },
  },
};
