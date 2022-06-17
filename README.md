# Airbyte Local

CLI for running Airbyte sources & destinations locally without Airbyte server

## Example Usage

**Note**: The source arguments may differ depending on the source being used.

```sh
./airbyte-local.sh \
   --src 'farosai/airbyte-servicenow-source' \
   --src.username '<source_username>' \
   --src.password '<source_password>' \
   --src.url '<source_url>' \
   --dst 'farosai/airbyte-faros-destination' \
   --dst.faros_api_url '<faros_api_url>' \
   --dst.faros_api_key '<faros_api_key>' \
   --dst.graph 'default' \
   --state state.json \
   --check-connection
```
