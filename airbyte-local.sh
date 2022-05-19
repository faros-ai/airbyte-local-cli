#!/usr/bin/env bash

set -eo pipefail

declare -a required_cmds=("docker" "jq")
for i in "${required_cmds[@]}"; do
    which "$i" &> /dev/null ||
        { echo "Error: $i is required." && missing_require=1; }
done

if ((${missing_require:-0})); then
    echo "Please ensure docker and jq are available before running the script."
    exit 1
fi

pagerduty_src_catalog=$(cat << EOF
{
  "streams": [
    {
      "stream": {
        "name": "incident_log_entries"
      },
      "config": {
        "syncMode": "incremental"
      }
    },
    {
      "stream": {
        "name": "incidents"
      },
      "config": {
        "syncMode": "incremental"
      }
    },
    {
      "stream": {
        "name": "users"
      },
      "config": {
        "syncMode": "full_refresh"
      }
    },
    {
      "stream": {
        "name": "priorities_resource"
      },
      "config": {
        "syncMode": "full_refresh"
      }
    }
  ]
}
EOF
)

servicenow_src_catalog=$(cat << EOF
{
  "streams": [
    {
      "stream": {
        "name": "incidents"
      },
      "config": {
        "syncMode": "incremental"
      }
    },
    {
      "stream": {
        "name": "users"
      },
      "config": {
        "syncMode": "full_refresh"
      }
    }
  ]
}
EOF
)

function setDefaults() {
    declare -Ag src_config=()
    declare -Ag dst_config=()
    dst_docker_image="farosai/airbyte-faros-destination"
    dst_graph="default"
}

function parseFlags() {
    while (($#)); do
        case "$1" in
            --src)
                src_docker_image="$2:latest"
                shift 2 ;;
            --dst)
                dst_docker_image="$2:latest"
                shift 2 ;;
            --src.*)
                IFS='.' read -ra strarr <<< $1
                key="${strarr[1]}"
                val="$2"
                src_config[$key]=$val
                shift 2 ;;
            --dst.*)
                IFS='.' read -ra strarr <<< $1
                key="${strarr[1]}"
                val="$2"
                dst_config[$key]=$val
                shift 2 ;;
            *)
                POSITION+=("$1")
                shift ;;
        esac
    done
}

# TODO: arrays, objects
function valType() {
    if [[ $1 =~ ^[0-9]+$ ]] ; then
        echo "integer"
    elif [[ $1 =~ true|false ]]; then
        echo "boolean"
    else
        echo "string"
    fi
}

function writeSrcConfig() {
    configs=()
    for k in "${!src_config[@]}"; do
        val=${src_config[$k]}
        if [[ $(valType ${src_config[$k]}) == "string" ]]; then
            val="\"${src_config[$k]}\""
        fi
        configs+=("\"$k\":$val")
    done
    echo "{$(IFS=, ; echo "${configs[*]}")}" | jq > src_config.json
}

function writeSrcCatalog() {
    case $src_docker_image in
        *pagerduty*)
            echo $pagerduty_src_catalog | jq > src_catalog.json
            stream_prefix=mypagerdutysrc__pagerduty__
            ;;
        *servicenow*)
            echo $servicenow_src_catalog | jq > src_catalog.json
            stream_prefix=myservicenowsrc__servicenow__
            ;;
        *)
            echo "Error: $src_docker_image is currently not supported"
            exit 1
            ;;
    esac
}

function sync() {
    docker run --rm -v $(pwd):/configs $src_docker_image read --config /configs/src_config.json --catalog /configs/src_catalog.json | \
        jq -c -R $jq_cmd "fromjson? | select(.type == \"RECORD\") | .record.stream = \"${stream_prefix}\(.record.stream)\""
}

main() {
    echo -e "Using bash version ${BASH_VERSION}. This script requires at least bash version 4.0\n"
    setDefaults
    parseFlags "$@"
    writeSrcConfig
    writeSrcCatalog
    echo "Pulling source image $src_docker_image"
    docker pull $src_docker_image
    echo "Pulling destination image $dst_docker_image"
    docker pull $dst_docker_image
    sync
}

main "$@"; exit
