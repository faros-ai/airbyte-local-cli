#!/usr/bin/env bash

[ "${BASH_VERSINFO:-0}" -ge 4 ] || { echo "Error: Bash 4.0 or higher is required." && exit 1; }

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
                src_docker_image="$2"
                shift 2 ;;
            --dst)
                dst_docker_image="$2"
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
            --src-only)
                run_src_only=true
                shift 1 ;;
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

# TODO: support CE
function writeDstConfig() {
    declare -A edition_configs=( ["edition"]="cloud" ["api_url"]="${dst_config[faros_api_url]}" ["api_key"]="${dst_config[faros_api_key]}" ["graph"]="${dst_config[graph]}" )
    dst_config["edition_configs"]=$(cat << EOF
{
    "edition": "cloud",
    "api_url": "${dst_config[faros_api_url]}",
    "api_key": "${dst_config[faros_api_key]}",
    "graph": "${dst_config[graph]}"
}
EOF
)
    unset dst_config[faros_api_url]
    unset dst_config[faros_api_key]
    unset dst_config[graph]

    # https://stackoverflow.com/questions/44792241/constructing-a-json-hash-from-a-bash-associative-array
    for key in "${!dst_config[@]}"; do
        printf '%s\0%s\0' "$key" "${dst_config[$key]}"
    done |
    jq -Rs '
      split("\u0000")
      | . as $a
      | reduce range(0; length/2) as $i
          ({}; . + {($a[2*$i]): ($a[2*$i + 1]|fromjson? // .)})' > "$tempdir/$dst_config_filename"
}

function writeDstCatalog() {
    cat "$tempdir/$src_catalog_filename" | jq ".streams[].stream.name |= \"${stream_prefix}\" + ." > "$tempdir/$dst_catalog_filename"
}

function sync() {
    source_output_file="$tempdir/source_output.txt"
    runSrc | tee "$source_output_file"

    cat "$source_output_file" | \
    jq -c -R $jq_cmd "fromjson? | select(.type == \"RECORD\") | .record.stream |= \"${stream_prefix}\" + ." | \
    docker run -i -v "$tempdir:/configs" "$dst_docker_image" write --config "/configs/$dst_config_filename" --catalog "/configs/$dst_catalog_filename"
}

function runSrc() {
    docker run --rm -v "$tempdir:/configs" "$src_docker_image" read --config "/configs/$src_config_filename" --catalog "/configs/$src_catalog_filename"
}

function validateSrc() {
    echo "Validating connection to source"
    connectionStatusInfo=$(docker run --rm -v "$tempdir:/configs" "$src_docker_image" check --config "/configs/$src_config_filename")
    connectionStatus=$(echo $connectionStatusInfo | jq -r '.connectionStatus.status')
    if [ $connectionStatus != 'SUCCEEDED' ]; then
      echo $connectionStatusInfo
      exit 1;
    fi
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
    validateSrc

    if [ "$run_src_only" = true ]; then
        echo -e "\nOnly running source image. Source logs will be shown below."
        runSrc
    else
        echo -e "\nRunning source image and piping output to destination image."
        sync
    fi
}

main "$@"; exit