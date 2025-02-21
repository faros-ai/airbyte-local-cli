## Replace the api key
# Please make sure your key and url is pointing to DEV
export FAROS_API_KEY=""
export FAROS_API_URL="https://dev.api.faros.ai"

jq --arg api_key "$FAROS_API_KEY" '
  .src.config.api_key = $api_key |
  .dst.config.edition_configs.api_key = $api_key
' ./resources/graph_copy.json.template > ./resources/graph_copy.json
jq --arg api_key "$FAROS_API_KEY" '
  .src.config.api_key = $api_key |
  .dst.config.edition_configs.api_key = $api_key
' ./resources/graph_copy_with_tags.json.template > ./resources/graph_copy_with_tags.json
jq --arg api_key "$FAROS_API_KEY" '
  .src.config.api_key = $api_key |
  .dst.config.edition_configs.api_key = $api_key
' ./resources/graph_copy_docker_options.json.template > ./resources/graph_copy_docker_options.json

jq --arg api_key "$FAROS_API_KEY" '
  .src.config.api_key = $api_key
' ./resources/graph_copy_src_only.json.template > ./resources/graph_copy_src_only.json
jq --arg api_key "$FAROS_API_KEY" '
  .src.config.api_key = $api_key
' ./resources/graph_copy_src_only_catalog.json.template > ./resources/graph_copy_src_only_catalog.json
jq --arg api_key "$FAROS_API_KEY" '
  .dst.config.edition_configs.api_key = $api_key
' ./resources/graph_copy_dst_only.json.template > ./resources/graph_copy_dst_only.json


## Test

# src only with stdout output
./airbyte-local \
  --config-file './resources/graph_copy_src_only.json' \
  --src-only

# src only with output file
./airbyte-local \
  --config-file './resources/graph_copy_src_only.json' \
  --src-output-file 'graph_copy_output'

# dst only
./airbyte-local \
  --config-file './resources/graph_copy_dst_only.json' \
  --dst-only './resources/graph_copy_src_output'

# src and dst sync
./airbyte-local \
  --config-file './resources/graph_copy.json' 

# src sync with catalogs
./airbyte-local \
  --config-file './resources/graph_copy_src_only_catalog.json' \
  --src-only

# src and dst sync with docker options
./airbyte-local \
  --config-file './resources/graph_copy_docker_options.json' \
  --keep-containers

# check connection
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --src-check-connection \

# images with tags
./airbyte-local \
  --config-file './resources/graph_copy_with_tags.json'

# full refresh
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --full-refresh

# config with missing image config
./airbyte-local \
  --config-file './resources/graph_copy_no_image.json' 

# with state file
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --state-file './resources/jennie__state.json'

# with keep containers flag
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --keep-containers

# with raw messages flag
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --raw-messages

# with no pull flags
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --no-src-pull \
  --no-dst-pull

# with debug flag
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --debug

# with connection name flag
./airbyte-local \
  --config-file './resources/graph_copy.json' \
  --connection-name 'jennie__connection'

# with src only and src output file
./airbyte-local \
  --config-file './resources/graph_copy_src_only.json' \
  --connection-name 'jennie__connection' \
  --src-output-file 'graph_copy_output'

# with json string config
./airbyte-local  \
  --src 'farosai/airbyte-faros-graphql-source' \
  --src.api_url $FAROS_API_URL \
  --src.api_key $FAROS_API_KEY \
  --src.graph 'faros' \
  --src.graphql_api 'v2' \
  --src.result_model 'Flat' \
  --src.models_filter '["org_Team"]' \
  --dst 'farosai/airbyte-faros-destination' \
  --dst.edition_configs '{"edition":"cloud", "graph":"jennie-test", "graphql_api": "v2"}' \
  --dst.edition_configs.api_url $FAROS_API_URL \
  --dst.edition_configs.api_key $FAROS_API_KEY

# graphql source
./airbyte-local  \
  --src 'farosai/airbyte-faros-graphql-source' \
  --src.api_url $FAROS_API_URL \
  --src.api_key $FAROS_API_KEY \
  --src.graph 'faros' \
  --src.graphql_api 'v2' \
  --src.result_model 'Flat' \
  --src.models_filter '["org_Team"]' \
  --dst 'farosai/airbyte-faros-destination' \
  --dst.edition_configs.edition 'cloud' \
  --dst.edition_configs.graph 'jennie-test' \
  --dst.edition_configs.graphql_api 'v2' \
  --dst.edition_configs.api_url $FAROS_API_URL \
  --dst.edition_configs.api_key $FAROS_API_KEY

# github source
./airbyte-local  \
  --src farosai/airbyte-github-source \
  --src.authentication.type "token" \
  --src.authentication.personal_access_token $GITHUB_TOKEN \
  --src.organizations '["jg-test-org-1","jg-test-org-2"]' \
  --dst farosai/airbyte-faros-destination \
  --dst.edition_configs.graph 'jennie-test' \
  --dst.edition_configs.api_key $FAROS_API_KEY \
  --dst.edition_configs.api_url $FAROS_API_URL \
  --connection-name "mygithubsrc"

# riskfield github source
# update to my own org and dev env
./airbyte-local \
  --src "farosai/airbyte-github-source" \
  --src.authentication.type "token" \
  --src.authentication.personal_access_token "$GITHUB_TOKEN" \
  --src.organizations "[\"jg-test-org-1\"]" \
  --src.use_faros_graph_repos_selection "true" \
  --src.api_url "https://dev.api.faros.ai" \
  --src.api_key "$FAROS_API_KEY" \
  --src.graph "jennie-test" \
  --src.run_mode "Custom" \
  --src.custom_streams "[\"faros_commits\",\"faros_copilot_seats\",\"faros_copilot_usage\",\"faros_organizations\",\"faros_pull_requests\",\"faros_releases\",\"faros_repositories\",\"faros_users\"]" \
  --src.fetch_teams "true" \
  --src.copilot_licenses_dates_fix "false" \
  --src.cutoff_days "7" \
  --dst "farosai/airbyte-faros-destination" \
  --dst.edition_configs.edition "cloud" \
  --dst.edition_configs.api_url "https://dev.api.faros.ai" \
  --dst.edition_configs.api_key "$FAROS_API_KEY" \
  --dst.edition_configs.graphql_api "v2" \
  --dst.edition_configs.graph "jennie-test" \
  --connection-name "github_v2"
# -->
./airbyte-local \
  --config-file './resources/github_riskifield.json' \
  --connection-name "github_v2"

# rickifield github coplilot source
./airbyte-local \
  --src "farosai/airbyte-github-source" \
  --src.authentication.type "token" \
  --src.authentication.personal_access_token "$GITHUB_TOKEN" \
  --src.organizations "[\"faros-ai\"]" \
  --src.use_faros_graph_repos_selection "true" \
  --src.api_url "https://dev.api.faros.ai" \
  --src.api_key "$FAROS_API_KEY" \
  --src.graph "jennie-test" \
  --src.run_mode "CopilotEvaluationApp" \
  --src.copilot_licenses_dates_fix "false" \
  --src.cutoff_days "7" \
  --dst "farosai/airbyte-faros-destination" \
  --dst.edition_configs.edition "cloud" \
  --dst.edition_configs.api_url "https://dev.api.faros.ai" \
  --dst.edition_configs.api_key "$FAROS_API_KEY" \
  --dst.edition_configs.graphql_api "v2" \
  --dst.edition_configs.graph "jennie-test" \
  --connection-name "github_v2_copilot"

# jira source
./airbyte-local \
  --src farosai/airbyte-jira-source \
  --src.url "https://xyz.atlassian.net" \
  --src.username "jennie@faros.ai" \
  --src.password "$JIRA_TOKEN" \
  --dst farosai/airbyte-faros-destination \
  --dst.edition_configs.api_key $FAROS_API_KEY \
  --dst.edition_configs.api_url $FAROS_API_URL \
  --dst.edition_configs.graph "jennie-test"
