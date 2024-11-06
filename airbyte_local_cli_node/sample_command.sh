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

npx tsx src/index.ts \
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

npx tsx src/index.ts \
  --src.username '<source_username>' \
  --src.password '<source_password>' \
  --src.url '<source_url>' \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination' \
  --dst.a.b.c 'd' \
  --dst.a.c 'b' \
  --dst.x \
  --dst.edition_configs.edition 'cloud' \
  --dst.edition_configs.api_url '<faros_api_url>' \
  --dst.edition_configs.api_key '<faros_api_key>' \
  --dst.edition_configs.graph 'default' \
  --state state.json \
  --check-connection \
  --debug

npx tsx src/index.ts \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination' \
  --src-output-file 'out/src-config.json' \
  --src-only \
  --debug
npx tsx src/index.ts \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination' \
  --no-src-pull \
  --no-dst-pull \
  --debug

./out/pkg/index-macos  \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination'
./out/pkg/index-macos  \
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
