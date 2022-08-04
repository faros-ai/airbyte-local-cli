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

To generate the Airbyte catalog needed for running the source and destination
connectors, the script runs the `discover` command on the source to get the list
of all supported streams. It then creates an Airbyte configured catalog,
enabling all of the streams and using "incremental" sync mode for all the
streams that support it. Each stream's destination sync mode defaults to
"append" for incremental streams and "overwrite" for full_refresh streams. To
disable or customize the sync mode or destination sync mode on any of the
streams, pass a `--src-catalog-overrides` option whose value is a JSON string in
the following format:

```
{
   "<stream name 1>": {"disabled": true},
   "<stream name 2>": {"sync_mode": "full_refresh", "destination_sync_mode": "append"}
}
```

You can also force full_refresh mode for all streams by setting the
`--full-refresh` flag.
