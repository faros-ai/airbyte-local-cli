#!/usr/bin/env bash

echo -e "Using bash version ${BASH_VERSION}. This script requires at least bash version 4.0\n"

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
      "sync_mode": "incremental",
      "destination_sync_mode": "append"
    },
    {
      "stream": {
        "name": "incidents"
      },
      "sync_mode": "incremental",
      "destination_sync_mode": "append"
    },
    {
      "stream": {
        "name": "users"
      },
      "sync_mode": "full_refresh",
      "destination_sync_mode": "overwrite"
    },
    {
      "stream": {
        "name": "priorities_resource"
      },
      "sync_mode": "full_refresh",
      "destination_sync_mode": "overwrite"
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
      "sync_mode": "incremental",
      "destination_sync_mode": "append"
    },
    {
      "stream": {
        "name": "users"
      },
      "sync_mode": "full_refresh",
      "destination_sync_mode": "overwrite"
    }
  ]
}
EOF
)

filename_prefix=faros_airbyte_cli
src_config_filename=${filename_prefix}_src_config.json
src_catalog_filename=${filename_prefix}_src_catalog.json
dst_config_filename=${filename_prefix}_dst_config.json
dst_catalog_filename=${filename_prefix}_dst_catalog.json

function setDefaults() {
    declare -Ag src_config=()
    declare -Ag dst_config=( ["graph"]="default" )
    dst_docker_image="farosai/airbyte-faros-destination"
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
                src_config[$key]="${val}"
                shift 2 ;;
            --dst.*)
                IFS='.' read -ra strarr <<< $1
                key="${strarr[1]}"
                val="$2"
                dst_config[$key]="${val}"
                shift 2 ;;
            *)
                POSITION+=("$1")
                shift ;;
        esac
    done
}

function writeSrcConfig() {
    # https://stackoverflow.com/questions/44792241/constructing-a-json-hash-from-a-bash-associative-array
    for key in "${!src_config[@]}"; do
        printf '%s\0%s\0' "$key" "${src_config[$key]}"
    done |
    jq -Rs '
      split("\u0000")
      | . as $a
      | reduce range(0; length/2) as $i
          ({}; . + {($a[2*$i]): ($a[2*$i + 1]|fromjson? // .)})' > "$tempdir/$src_config_filename"
}

# TODO: take catalog as input parameter
function writeSrcCatalog() {
    case $src_docker_image in
        *pagerduty*)
            echo $pagerduty_src_catalog | jq > $tempdir/$src_catalog_filename
            stream_prefix=mypagerdutysrc__pagerduty__
            ;;
        *servicenow*)
            echo $servicenow_src_catalog | jq > $tempdir/$src_catalog_filename
            stream_prefix=myservicenowsrc__servicenow__
            ;;
        *)
            echo "Error: $src_docker_image is currently not supported"
            exit 1
            ;;
    esac
}

# TODO: optional faros destination configs e.g. source-specific configs
#       support CE
function writeDstConfig() {
    jq -n \
        --arg api_url "${dst_config[faros_api_url]}" \
        --arg api_key "${dst_config[faros_api_key]}" \
        --arg graph "${dst_config[graph]}" \
        '{edition_configs: {edition: "cloud", api_url: $api_url, api_key: $api_key, graph: $graph}}' > $tempdir/$dst_config_filename
}

function writeDstCatalog() {
    cat $src_catalog_filename | jq ".streams[].stream.name |= \"${stream_prefix}\" + ." > $tempdir/$dst_catalog_filename
}

function sync() {
    echo -e "\nRunning source image and piping output to destination image. Destination logs will be shown below."
    docker run --rm -v "$tempdir:/configs" "$src_docker_image" read --config "/configs/$src_config_filename" --catalog "/configs/$src_catalog_filename" | \
    jq -c -R $jq_cmd "fromjson? | select(.type == \"RECORD\") | .record.stream |= \"${stream_prefix}\" + ." | \
    docker run -i -v "$tempdir:/configs" "$dst_docker_image" write --config "/configs/$dst_config_filename" --catalog "/configs/$dst_catalog_filename"
}

tempdir=$(mktemp -d)
echo "Created folder $tempdir for temporary airbyte files"

function cleanup() {
    rm -rf "$tempdir"
}

trap cleanup EXIT
trap cleanup SIGINT

set -eo pipefail

main() {
    setDefaults
    parseFlags "$@"
    writeSrcConfig
    writeSrcCatalog
    writeDstConfig
    writeDstCatalog
    echo "Pulling source image $src_docker_image"
    docker pull $src_docker_image
    echo "Pulling destination image $dst_docker_image"
    docker pull $dst_docker_image
    sync
}

main "$@"; exit
