# Airbyte Local CLI [![CI](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml/badge.svg)](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml)

CLI for running Airbyte sources & destinations locally without Airbyte server

![Alt Text](https://github.com/Faros-ai/airbyte-local-cli/raw/main/resources/demo.gif)

## Example Usage

**Requirements**: `bash`, `docker`, `jq`, `tee`


For example here how you can sync ServiceNow source with [Faros Cloud](https://www.faros.ai) destination:

**Note**: The `src.*` and `dst.*` arguments will differ depending on the source and destination being used.

```sh
./airbyte-local.sh \
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
```

Or with [Faros Community Edition](https://github.com/faros-ai/faros-community-edition) as the destination:

```sh
./airbyte-local.sh \
   --src 'farosai/airbyte-servicenow-source' \
   --src.username '<source_username>' \
   --src.password '<source_password>' \
   --src.url '<source_url>' \
   --dst 'farosai/airbyte-faros-destination' \
   --dst.edition_configs.edition 'community' \
   --dst.edition_configs.hasura_admin_secret 'admin' \
   --dst.edition_configs.hasura_url 'http://host.docker.internal:8080/' \
   --state state.json \
   --check-connection
```

## Arguments

| Argument                          | Required | Description                                                                                       |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| --src \<image\>                   | Yes      | Airbyte source Docker image                                                                       |
| --dst \<image\>                   | Yes      | Airbyte destination Docker image                                                                  |
| --src.\<key\> \<value\>           |     | Append `"key": "value"` into the source config \*                                                 |
| --dst.\<key\> \<value\>           |     | Append `"key": "value"` into the destination config                                               |
| --check-connection                |     | Validate the Airbyte source connection                                                            |
| --full-refresh                    |     | Force source full_refresh and destination overwrite mode                                          |
| --state \<path\>                  |     | Override state file path for incremental sync                                                     |
| --src-catalog-overrides \<json\>  |     | JSON string of sync mode overrides. See [overriding default catalog](#overriding-default-catalog) |
| --src-catalog-file \<path\>       |     | Source catalog file path                                                                          |
| --src-catalog-json \<json\>       |     | Source catalog as a JSON string                                                                   |
| --dst-catalog-file \<path\>       |     | Destination catalog file path                                                                     |
| --dst-catalog-json \<json\>       |     | Destination catalog as a JSON string                                                              |
| --dst-stream-prefix \<prefix\>    |     | Destination stream prefix                                                                         |
| --no-src-pull                     |     | Skip pulling Airbyte source image                                                                 |
| --no-dst-pull                     |     | Skip pulling Airbyte destination image                                                            |
| --src-only                        |     | Only run the Airbyte source                                                                       |
| --connection-name                 |     | Connection name used in various places                                                            |
| --max-log-size \<size\>           |     | Set Docker maximum log size                                                                       |
| --max-mem \<mem\>                 |     | Set maximum amount of memory each Docker container can use, e.g `"1g"`                            |
| --max-cpus \<cpus\>               |     | Set maximum CPUs each Docker container can use, e.g `"1"`                                         |
| --src-docker-options "\<string\>" |     | Set additional options to pass to the `docker run <src>` command                                  |
| --dst-docker-options "\<string\>" |     | Set additional options to pass to the `docker run <dst>` command                                  |
| --debug                           |     | Enable debug logging                                                                              |

**Note**: when passing an array value for a parameter specify it as a json array, for example:

```
--src.projects '["project-1","project-2","project-3"]'
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

```json
{
  "<stream name 1>": { "disabled": true },
  "<stream name 2>": {
    "sync_mode": "full_refresh",
    "destination_sync_mode": "append"
  }
}
```

You can also force full_refresh mode for all streams by setting the `--full-refresh` flag.
