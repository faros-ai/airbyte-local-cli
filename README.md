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

## Overriding Default Catalog

To generate the Airbyte catalog needed for running the source and destination connectors, the script runs the `discover` command on the source to get the list of all supported streams. It then creates an Airbyte catalog, enabling all of the streams and using incremental mode for all the streams that support it. To disable or force full_refresh mode on any of the streams, pass a `--src-catalog` option whose value is a JSON string in the following format:

```
{
   "<stream name 1>": "disabled" or "full_refresh",
   "<stream name 2>": ...
}
```

You can also force full_refresh mode for all streams by setting the `--full-refresh` flag.
