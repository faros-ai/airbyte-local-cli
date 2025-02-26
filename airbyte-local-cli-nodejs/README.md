# Airbyte Local CLI [![CI](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml/badge.svg)](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml)

CLI for running Airbyte sources & destinations locally.

## Getting Started

**Supported System**

- Linux x86_64
- MacOS arm64 (Apple chip)
- Windows x86_64

**Prerequisites**:

- Docker
- Faros API key: check out the [instructions](https://docs.faros.ai/reference/getting-api-access).

### 1. Install

[All releases](https://github.com/faros-ai/airbyte-local-cli/releases.)

#### Linux/MacOS

Here is the steps of downloading the CLI on MacOS. Linux should have very similar steps.

```sh
# Download from the CLI
# Please swap out `v0.0.1-beta.6` to the version you want
wget -o https://github.com/faros-ai/airbyte-local-cli/releases/download/v0.0.1-beta.6/airbyte-local-macos-arm64.zip | unzip -o airbyte-local-macos-arm64.zip

# run `--help` or `--version` to check if the CLI is installed correctly
./airbyte-local --help
./airbyte-local --version
```

#### Windows (Powershell)

```ps1
# Download from the CLI
# Please swap out `v0.0.1-beta.6` to the version you want
Invoke-WebRequest -Uri "https://github.com/faros-ai/airbyte-local-cli/releases/download/v0.0.1-beta.6/airbyte-local-win-x64.zip" -OutFile "airbyte-local-win-x64.zip"
Expand-Archive -Path "airbyte-local-win-x64.zip" -DestinationPath . -Force

# run `--help` or `--version` to check if the CLI is installed correctly
.\airbyte-local --help
.\airbyte-local --version

```

### 2. Create an Airbyte Configuration File

The CLI uses arguement `--config-file` to take the airybte configuration in a JSON file format.

JSON Schema

```json
{
  "src": {
    "image": "<YOUR_SOURCE_IMAGE_NAME>",
    "config": {...YOUR_SOURCE_CONFIG...}
  },
  "dst": {
    "image": "<YOUR_DESTINATION_IMAGE_NAME>",
    "config": {...YOUR_DESTINATION_CONFIG...}
  }
}
```

You can find all the available soure and destiantion images that are supported by Faros [here](https://hub.docker.com/u/farosai). \
Here're some popular source image

- Github source: `farosai/airbyte-github-source`
- Jira source: `farosai/airbyte-jira-source`
- Faros destination: `farosai/airbyte-faros-destination`

#### Example of Airbyte Config File

Assuming you want to pull data from Github org `my-org` by using GitHub PAT and push data to Faros `default` workspace. This is what the JSON would look like

```json
{
  "src": {
    "image": "farosai/airbyte-github-source",
    "config": {
      "api_key": "<YOUR_FAROS_API_KEY>",                              <-- Faros API key
      "graph": "default"                                              <-- Faros workspace
      "authentication": {
        "type": "token",
        "personal_access_token": "<YOUR_GITHUB_PAT_TOKEN>"
      },
      "organizations": ["my-org"],
    }
  },
  "dst": {
    "image": "farosai/airbyte-faros-destination",
    "config": {
      "edition_configs": {
        "api_key": "<YOUR_FAROS_API_KEY>",                            <-- Faros API key
        "graph": "default"                                            <-- Faros workspace
      }
    }
  }
}
```

Save it as `myTestFarosConfig.json`. \
In most cases, you always have to provide Faros API key and workspace under `src.config` and `dst.config.edition_configs`.

More resources you can find it in [Faros Documantation](https://docs.faros.ai/), e.g. instructions to create GitHub PAT and what permission you need for the PAT, etc.

### 3. Run it!

#### Linux/MacOS

```sh
./airbyte-local --config-file 'myTestFarosConfig.json'
```

#### Windows (Powershell)

```ps1
./airbyte-local --config-file 'myTestFarosConfig.json'
```

The logs should indicate the process of the data sync. \
You can also see the progress and logs in Faros App > Switch to the workspace you are running against > Admin Settings > Data Control > Sources.

## Advanced Settings

In some cases, you might want to customized the data sync more. \
We provide some more CLI optional arguments and optional fields in the Airbyte configuration file.

### CLI Arguments

| Option                     | Required | Description                                                                                                |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `--config-file <path>`     | Yes      | Airbyte source and destination connector config JSON file path                                             |
| `-h, --help`               |          | Display usage information                                                                                  |
| `-v, --version`            |          | Output the current version                                                                                 |
| `--full-refresh`           |          | Force full_refresh and overwrite mode. This overrides the mode in provided config file                     |
| `--state-file <path>`      |          | Override state file path for incremental sync                                                              |
| `--no-src-pull`            |          | Skip pulling Airbyte source image                                                                          |
| `--no-dst-pull`            |          | Skip pulling Airbyte destination image                                                                     |
| `--src-only`               |          | Only run the Airbyte source and write output in stdout. Use '--src-output-file' instead to write to a file |
| `--src-output-file <path>` |          | Write source output as a file (requires a destination)                                                     |
| `--src-check-connection`   |          | Validate the Airbyte source connection                                                                     |
| `--dst-only <file>`        |          | Use a file for destination input instead of a source                                                       |
| `--dst-use-host-network`   |          | Use the host network when running the Airbyte destination                                                  |
| `--log-level <level>`      |          | Set level of source and destination loggers (default: "info")                                              |
| `--raw-messages`           |          | Output raw Airbyte messages                                                                                |
| `--connection-name <name>` |          | Connection name used in various places                                                                     |
| `--keep-containers`        |          | Do not remove source and destination containers after they exit                                            |
| `--debug`                  |          | Enable debug logging                                                                                       |
| `--src <image>`            |          | [Deprecated] Airbyte source Docker image                                                                   |
| `--dst <image>`            |          | [Deprecated] Airbyte destination Docker image                                                              |
| `--src.<key> <value>`      |          | [Deprecated] Add "key": "value" into the source config                                                     |
| `--dst.<key> <value>`      |          | [Deprecated] Add "key": "value" into the destination config                                                |

#### Example Usage

##### Linux/MacOS

```sh
# Turn on debug logs
./airbyte-local --config-file 'sample.json' --debug

# Run source sync only
./airbyte-local \
  --config-file 'sample.json' \
  --src-only

# Check source connection
./airbyte-local \
  --config-file 'sample.json' \
  --src-check-connection

# Enforce full refreash
./airbyte-local \
  --config-file 'sample.json' \
  --full-refresh

# Use customized connection name
./airbyte-local \
  --config-file 'sample.json' \
  --connection-name 'test-connection'
```

##### Windows (Powershell)

```ps1
# Turn on debug logs
./airbyte-local --config-file 'sample.json' --debug

# Run source sync only
./airbyte-local `
  --config-file 'sample.json' `
  --src-only

# Check source connection
./airbyte-local `
  --config-file 'sample.json' `
  --src-check-connection

# Enforce full refreash
./airbyte-local `
  --config-file 'sample.json' `
  --full-refresh

# Use customized connection name
./airbyte-local `
  --config-file 'sample.json' `
  --connection-name 'test-connection'
```

### Airbyte Configuration - Override Airbyte Catalog

You can override the default Airbyte catalog in the Airbyte configuration file that passed via `--config-file`. \
It should be defined under `catalog` and src and dst has the same schema.
You will have to know the stream name and sync mode you would like to run.

```json
{
  "src": {
    "image": ...,
    "config": ...,
    "catalog": {                                                     <-- define your catalog
      "streams":[
          {
            "stream":{"name":"<STREAM_NAME>"},                       <-- stream name
            "sync_mode":"full_refresh"                               <-- sync mode: "full_refresh" or "incremental"
          }
      ]
    }
  },
  "dst": {
    "image": ...,
    "config": ...,
    "catalog": {
      ...
    }
  }
}
```

### Airbyte Configuration - Customize Docker Settings

If you want to customize the Airbyte connectors docker settings, there're optional fields that you configure CPU, memory and log file size. This can be do so by specifying in the Airbyte configuration file.

```json
{
  "src": {
    "image": ...,
    "dockerOptions":  {
      "maxCpus": 2,                                                <-- unit: CPU (type: number)
      "maxMemory": 256 ,                                           <-- unit: MB (type: number)
      "maxLogSize": "10m"                                          <-- unit: k/m/g (type: string)
    }
  },
  ...
}

```

### WIP

- `--wizard` argument

## Migration Guide

As some users might come from our previous bash version Airbyte CLI version.
Here is some guide for you to upgrade to the new one.

## FAQ

- If you have customized your docker socket, please exports the docker socket in env var `DOCKER_HOST`.
- We only support reading Airbyte configuration file in encoding: `utf-8`, `utf-16le`, `utf-16be`.
