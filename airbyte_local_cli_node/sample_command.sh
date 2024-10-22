node ./lib/index.js --help
node ./lib/index.js \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination' \
  --state state.json \
  --check-connection

vercel-pkg/index-macos --help
vercel-pkg/index-macos \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination' \
  --state state.json \
  --check-connection