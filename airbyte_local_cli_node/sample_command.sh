node ./lib/index.js --help
node ./lib/index.js \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination' \
  --state state.json \
  --check-connection
node ./lib/index.js \
  --src 'farosai/airbyte-servicenow-source' \
  --src.username '<source_username>' \
  --src.password '<source_password>' \
  --src.url '<source_url>' \
  --dst 'farosai/airbyte-faros-destination' \
  --dst.edition_configs.edition 'cloud' \
  --dst.edition_configs.api_url '<faros_api_url>' \
  --dst.edition_configs.api_key '<faros_api_key>' \
  --dst.edition_configs.graph 'default' \
  --state state.json \
  --check-connection
node ./lib/index.js \
  --src 'farosai/airbyte-servicenow-source' \
  --src.username '<source_username>' \
  --src.password '<source_password>' \
  --src.url '<source_url>' \
  --dst 'farosai/airbyte-faros-destination' \
  --dst.edition_configs.edition 'cloud' \
  --dst.edition_configs.api_url '<faros_api_url>' \
  --dst.edition_configs.api_key '<faros_api_key>' \
  --dst.edition_configs.graph 'default' \
  --state state.json \
  --check-connection \
  --output-config 'out/jg-config.json'

./out/yao-pkg/index-macos  \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination'
./out/yao-pkg/index-macos  \
  --src 'farosai/airbyte-servicenow-source' \
  --src.username '<source_username>' \
  --src.password '<source_password>' \
  --src.url '<source_url>' \
  --dst 'farosai/airbyte-faros-destination' \
  --dst.edition_configs.edition 'cloud' \
  --dst.edition_configs.api_url '<faros_api_url>' \
  --dst.edition_configs.api_key '<faros_api_key>' \
  --dst.edition_configs.graph 'default' \
  --state state.json \
  --check-connection \
  --output-config 'out/jg-config.json'
