# Airbyte Local CLI (Deprecated) [![CI](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml/badge.svg)](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml) [![Deprecated](https://img.shields.io/badge/status-deprecated-red)](../README.md)

⚠️ **DEPRECATION NOTICE** ⚠️  
This project is deprecated and is no longer actively maintained. Please use the new [Airbyte Local CLI](../README.md) instead.

## Migration Path

This project has been replaced by the new Airbyte Local CLI (Node.js) project.
Please refer to [Migration Guide](../README.md#migration-guide) for installation and usage instructions.

---

CLI for running Airbyte sources & destinations locally or on a Kubernetes cluster without an Airbyte server

![Alt Text](https://github.com/Faros-ai/airbyte-local-cli/raw/main/resources/demo.gif)

## Example Usage

**Requirements**: `bash`, `jq`, `tee`. Additionally, `docker` when running syncs locally, or `kubectl` when running on a Kubernetes cluster. 

Either [download the script manually](https://raw.githubusercontent.com/faros-ai/airbyte-local-cli/main/airbyte-local.sh) or invoke the script directly with curl:

```sh
bash <(curl -s https://raw.githubusercontent.com/faros-ai/airbyte-local-cli/main/airbyte-local.sh) --help
```

For example here is how you can sync ServiceNow source with [Faros Cloud](https://www.faros.ai) destination:

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
**Note**: The `src.*` and `dst.*` arguments will differ depending on the source and destination being used.

Or on a Kubernetes cluster:

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
  --k8s-deployment \
  --k8s-namespace default \
  --max-cpus 0.5 \
  --max-mem 500Mi \
  --keep-containers
```
**Note**: The command assumes Kubernetes cluster context, and credentials are already configured. For more info, see [official docs](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/).


## Configuring Faros source/destination using a wizard

**Note**: Faros Sources and/or Faros Destination only. Not supported with Kubernetes deployment.

Instead of passing `src.*` and `dst.*`, it is possible to invoke a configuration wizard for the Faros source 
and/or destination:

```
./airbyte-local.sh \
  --src 'farosai/airbyte-servicenow-source' \
  --src-wizard \
  --dst 'farosai/airbyte-faros-destination' \
  --dst-wizard
```

## Arguments

| Argument                          | Required | Description                                                                                       |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| --src \<image\>                   | Yes      | Airbyte source Docker image                                                                       |
| --dst \<image\>                   | Yes      | Airbyte destination Docker image                                                                  |
| --src.\<key\> \<value\>           |          | Append `"key": "value"` into the source config \*                                                 |
| --dst.\<key\> \<value\>           |          | Append `"key": "value"` into the destination config \*                                            |
| --check-connection                |          | Validate the Airbyte source connection                                                            |
| --full-refresh                    |          | Force source full_refresh and destination overwrite mode                                          |
| --state \<path\>                  |          | Override state file path for incremental sync                                                     |
| --src-output-file \<path\>        |          | Write source output as a file (handy for debugging)                                               |
| --src-catalog-overrides \<json\>  |          | JSON string of sync mode overrides. See [overriding default catalog](#overriding-default-catalog) |
| --src-config-file \<path\>        |          | Source config file path                                                                           |
| --src-config-json \<json\>        |          | Source config as a JSON string                                                                    |
| --src-catalog-file \<path\>       |          | Source catalog file path                                                                          |
| --src-catalog-json \<json\>       |          | Source catalog as a JSON string                                                                   |
| --dst-config-file \<path\>        |          | Destination config file path                                                                      |
| --dst-config-json \<json\>        |          | Destination config as a JSON string                                                               |
| --dst-catalog-file \<path\>       |          | Destination catalog file path                                                                     |
| --dst-catalog-json \<json\>       |          | Destination catalog as a JSON string                                                              |
| --dst-stream-prefix \<prefix\>    |          | Destination stream prefix                                                                         |
| --no-src-pull                     |          | Skip pulling Airbyte source image                                                                 |
| --no-dst-pull                     |          | Skip pulling Airbyte destination image                                                            |
| --src-wizard                      |          | Run the Airbyte source configuration  wizard                                                      |
| --dst-wizard                      |          | Run the Airbyte destination configuration  wizard                                                 |
| --src-only                        |          | Only run the Airbyte source                                                                       |
| --dst-only \<file\>               |          | Use a file for destination input instead of a source                                              |
| --connection-name                 |          | Connection name used in various places                                                            |
| --raw-messages                    |          | Output raw Airbyte messages, i.e., without a log prefix or colors                                 |
| --max-log-size \<size\>           |          | Set Docker maximum log size                                                                       |
| --max-mem \<mem\>                 |          | Set the maximum amount of memory for Docker or Kubernetes container, e.g., `"1g"` or `"1024Mi"`   |
| --max-cpus \<cpus\>               |          | Set the maximum number of CPUs for each Docker or Kubernetes container, e.g, `"1"` or `"1000m"`   |
| --src-docker-options "\<string\>" |          | Set additional options to pass to the `docker run <src>` command, e.g `--src-docker-options "-e NODE_OPTIONS=--max_old_space_size=2000 -e NODE_TLS_REJECT_UNAUTHORIZED=0"` |
| --dst-docker-options "\<string\>" |          | Set additional options to pass to the `docker run <dst>` command, e.g `--dst-docker-options "-e NODE_OPTIONS=--max_old_space_size=2000"` |
| --k8s-deployment                  |          | Deploy and run source/destination connectors as a pod on a Kubernetes cluster                     |
| --k8s-namespace \<name\>          |          | Kubernetes namespace where the source/destination connectors pod is deployed to                   |
| --keep-containers                 |          | Do not delete source and destination containers (or Kubernetes pod) after they exit               |
| --debug                           |          | Enable debug logging                                                                              |

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
