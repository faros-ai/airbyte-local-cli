# Airbyte Local CLI [![CI](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml/badge.svg)](https://github.com/faros-ai/airbyte-local-cli/actions/workflows/ci.yaml)

CLI for running Airbyte sources & destinations locally.

## Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Step 1. Install](#step-1-install)
  - [Step 2. Create an Airbyte Configuration File](#step-2-create-an-airbyte-configuration-file)
    - [Step 2a. Auto Generate Configuration Templates (Experimental)](#step-2a-auto-generate-configuration-templates-experimental)
    - [Step 2b. Craft your own configuration](#step-2b-craft-your-own-configuration)
  - [Step 3. Run it!](#step-3-run-it)
- [Advanced Settings](#advanced-settings)
  - [CLI Arguments](#cli-arguments)
  - [Airbyte Configuration - Override Airbyte Catalog](#airbyte-configuration---override-airbyte-catalog)
  - [Airbyte Configuration - Customize Docker Settings](#airbyte-configuration---customize-docker-settings)
- [FAQ](#faq)
- [Migration Guide](#migration-guide)
  - [Old CLI v.s. New CLI](#old-cli-vs-new-cli)
  - [New/Renamed Arguments](#newrenamed-arguments)
  - [Unsupported Arguments](#unsupported-arguments)

## Getting Started

**Supported System**

- Linux x86_64
- MacOS arm64 (Apple chip)
- Windows x86_64

### Prerequisites

- Docker
- Faros API key: check out the [instructions](https://docs.faros.ai/reference/getting-api-access).

### Step 1. Install

[All releases](https://github.com/faros-ai/airbyte-local-cli/releases.)

#### Linux/MacOS

Here is the steps of downloading the CLI on MacOS. Linux should have very similar steps.

```sh
# Download from the CLI
# Please swap out `v0.0.1-beta.6` to the version you want
wget -O airbyte-local.zip https://github.com/faros-ai/airbyte-local-cli/releases/download/v0.0.1-beta.8/airbyte-local-macos-arm64.zip
unzip -o airbyte-local.zip

# run `--help` or `--version` to check if the CLI is installed correctly
./airbyte-local # this shows the help manual
./airbyte-local --help
./airbyte-local --version
```

#### Windows (Powershell)

```ps1
# Download from the CLI
# Please swap out `v0.0.1-beta.6` to the version you want
Invoke-WebRequest -Uri "https://github.com/faros-ai/airbyte-local-cli/releases/download/v0.0.1-beta.8/airbyte-local-win-x64.zip" -OutFile "airbyte-local-win-x64.zip"
Expand-Archive -Path "airbyte-local-win-x64.zip" -DestinationPath . -Force

# run `--help` or `--version` to check if the CLI is installed correctly
.\airbyte-local
.\airbyte-local --help
.\airbyte-local --version

```

### Step 2. Create an Airbyte Configuration File

First of all, you will have to know where you want to pull data from and where you want to push data to.
For example, pulling data from Github and pushing data to Faros AI.

Then, there're two options you can go to create the config file.

a. Auto Generate Configuration Templates:
This is recommended for first-time users. It helps you to start with a template to update the Airbyte configs. (Go to Step 2a)

b. Craft your own configuration: This is for users that are familiar with Airbyte configurations and are looking for a finer tune on the configs. (Go to Step 2b)

#### Step 2a. Auto Generate Configuration Templates (Experimental)

You can utilize the `generate-config` subcommand to bootstrap your Airbyte config.
It's required to provide the Airbyte source, which means you will have to know which source data you are pulling from, e.g. Github, Jira, etc. For the Airbtye destination, it is set to Faros by default, i.e. pushing the data to Faros.
Currently we only support for Faros managed Airbyte source and destinations. We plan to support non Faros managed in the future.

By running this subcommand, it prints out both Airbyte source and deestination configuration tables in the terminal for your reference.
And it generates a template config file `faros_airbyte_cli_config.json` in the current directory. The template config file only includes requried configs. If you need additional configs, please refer to the configuration tables and update the config file.

Run the command to generate the template

```sh
# ./airbyte-local generate-config <source> [destination]

# ex: Pull data from Github and push to Faros
./airbyte-local generate-config github
./airbyte-local generate-config github faros

# ex: Pull data from Jira and push to Faros
./airbyte-local generate-config jira

# suppress printing out the configuration tables
./airbyte-local generate-config -s jira
```

Note: Both source and destination inputs are case insensitive and tolerate a bit of typos.

After running the command, you should see `🔹 **Next Steps:**` instructions showing up in your terminal. Follow the steps to complete the config.

#### Step 2b. Craft your own configuration

The CLI uses arguement `--config-file` (`-c` for short) to take the airybte configuration in a JSON file format.

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

Save it as `faros_airbyte_cli_config.json`. \
In most cases, you always have to provide Faros API key and workspace under `src.config` and `dst.config.edition_configs`.

More resources you can find it in [Faros Documantation](https://docs.faros.ai/), e.g. instructions to create GitHub PAT and what permission you need for the PAT, etc.

### Step 3. Run it!

#### Linux/MacOS

```sh
./airbyte-local --config-file 'faros_airbyte_cli_config.json'
./airbyte-local -c 'faros_airbyte_cli_config.json'
```

#### Windows (Powershell)

```ps1
.\airbyte-local --config-file 'faros_airbyte_cli_config.json'
.\airbyte-local -c 'faros_airbyte_cli_config.json'
```

The logs should indicate the process of the data sync. \
You can also see the progress and logs in Faros App > Switch to the workspace you are running against > Admin Settings > Data Control > Sources.

## Advanced Settings

In some cases, you might want to customized the data sync more. \
We provide some more CLI optional arguments and optional fields in the Airbyte configuration file.

### CLI Arguments

| Option                     | Required | Description                                                                                                |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `-c, --config-file <path>` | Yes      | Airbyte source and destination connector config JSON file path                                             |
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

## FAQ

- If you have customized your docker socket, please exports the docker socket in env var `DOCKER_HOST`.
- We only support reading Airbyte configuration file in encoding: `utf-8`, `utf-16le`, `utf-16be`.

## Migration Guide

As some users might come from our previous Airbyte CLI Bash version. \
Here is some guide for you to upgrade to the new one.

### Old CLI v.s. New CLI

1. Update the CLI from Bash script to binary - open up to users that don't use Bash by default
1. Move Airbyte configuration into one JSON file - avoid syntax issues caused by running on different systems

#### Example Usage

```sh
# Older version
./airbyte-local.sh  \
  --src 'farosai/airbyte-faros-graphql-source' \
  --src.api_url $FAROS_API_URL \
  --src.graph 'faros' \
  --src.result_model 'Flat' \
  --src.models_filter '["org_Team"]' \
  --dst 'farosai/airbyte-faros-destination' \
  --dst.edition_configs.graph 'default' \
  --dst.edition_configs.api_url $FAROS_API_URL

# Newer version
./airbyte-local --config-file graph_copy.json
```

### New/Renamed Arguments

| Old Argument         | New Argument             | Replacement/Notes                          |
| -------------------- | ------------------------ | ------------------------------------------ |
|                      | `--config-file`          | New arugment to take Airbyte configuration |
| `--check-connection` | `--src-check-connection` | For naming consistency                     |
| `--state <file>`     | `--state-file <file>`    | For naming consistency                     |

### Unsupported Arguments

The following arguments are droppeed in the new CLI. Please update your command according.

For arguments `--src ...` and `--dst ...`, they are still supported for user convenience. We strongly encourage users to use the new arugment `--config-file` to pass in Airbyte configuration in favor of the deprecated ones. Also, you can find a file named `faros_airbyte_cli_config.json` be automatically generated after running the CLI. It should covert your Airybte configuration to the new schema and next time you can just pass in this file with arugment `--config-file` and stop using the deprecated arguments!

| Argument                         | Status      | Replacement/Notes                                                   |
| -------------------------------- | ----------- | ------------------------------------------------------------------- |
| `--src <image>`                  | Deprecated  | Image name is now defined in Aribyte configuration file             |
| `--dst <image>`                  | Deprecated  | Image name is now defined in Aribyte configuration file             |
| `--src.<key> <value>`            | Deprecated  | Airbyte config is now defined in Aribyte configuration file         |
| `--dst.<key> <value>`            | Deprecated  | Airbyte config is now defined in Aribyte configuration file         |
| `--src-catalog-overrides <json>` | Unsupported | Airbyte catalog config is now defined in Aribyte configuration file |
| `--src-catalog-file <path>`      | Unsupported | Airbyte catalog config is now defined in Aribyte configuration file |
| `--src-catalog-json <json>`      | Unsupported | Airbyte catalog config is now defined in Aribyte configuration file |
| `--dst-catalog-file <path>`      | Unsupported | Airbyte catalog config is now defined in Aribyte configuration file |
| `--dst-catalog-json <json>`      | Unsupported | Airbyte catalog config is now defined in Aribyte configuration file |
| `--src-wizard`                   | Unsupported | Use `--generate-config` instead                                     |
| `--dst-wizard`                   | Unsupported | Use `--generate-config` instead                                     |
| `--max-log-size <size>`          | Unsupported | Docker settings are now defined in Aribyte configuration file       |
| `--max-mem <mem>`                | Unsupported | Docker settings are now defined in Aribyte configuration file       |
| `--max-cpus <cpus>`              | Unsupported | Docker settings are now defined in Aribyte configuration file       |
| `--src-docker-options "<string>` | Unsupported | Docker settings are now defined in Aribyte configuration file       |
| `--dst-docker-options "<string>` | Unsupported | Docker settings are now defined in Aribyte configuration file       |
| `--k8s-deployment`               | Unsupported | Stop surporting running on local kubernetes cluster                 |
| `--dst-stream-prefix <prefix>`   | Unsupported | Use `--connection-name` instead                                     |
