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

filename_prefix=faros_airbyte_cli
src_config_filename=${filename_prefix}_src_config.json
src_state_filename=${filename_prefix}_src_state.json
src_catalog_filename=${filename_prefix}_src_catalog.json
dst_config_filename=${filename_prefix}_dst_config.json
dst_catalog_filename=${filename_prefix}_dst_catalog.json

function setDefaults() {
    declare -Ag src_config=()
    declare -Ag dst_config=( ["graph"]="default" )
    dst_docker_image="farosai/airbyte-faros-destination"
    src_state_filepath="state.json"
    src_catalog_overrides="{}"
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
            --state)
                src_state_filepath="$2"
                shift 2 ;;
            --src.catalog)
                src_catalog_overrides="$2"
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
            --check-connection)
                check_src_connection=true
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

function discoverSrc() {
    docker run --rm -v "$tempdir:/configs" "$src_docker_image" discover \
      --config "/configs/$src_config_filename"
}

function writeSrcCatalog() {
    discoverSrc | jq --argjson src_catalog_overrides "$src_catalog_overrides" '{
      streams: [
        .catalog.streams[]
          | select($src_catalog_overrides[.name] != "disabled")
          | .incremental = ((.supported_sync_modes|contains(["incremental"])) and ($src_catalog_overrides[.name] != "full_refresh"))
          | {
              stream: {name: .name},
              sync_mode: (if .incremental then "incremental" else "full_refresh" end),
              destination_sync_mode: (if .incremental then "append" else "overwrite" end)
            }
      ]
    }' > $tempdir/$src_catalog_filename
    IFS='-' read -ra src_docker_image_parts <<< $src_docker_image
    if [[ $dst_docker_image == farosai/airbyte-faros-destination* ]] && [[ ${src_docker_image_parts[0]} == farosai/airbyte ]]; then
        # Remove first and last elements
        src_docker_image_parts=("${src_docker_image_parts[@]:1}")
        src_docker_image_parts=("${src_docker_image_parts[@]::${#src_docker_image_parts[@]}-1}");

        src_origin=$(IFS= ; echo "${src_docker_image_parts[*]}")
        src_type=$(IFS=_ ; echo "${src_docker_image_parts[*]}")
        stream_prefix="my${src_origin}src__${src_type}__"
    else
        echo "Error: $src_docker_image is currently not supported"
        exit 1
    fi
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

function loadState() {
    echo "Using state file: $src_state_filepath"
    if [ -s "$src_state_filepath" ]; then
        cat "$src_state_filepath" > "$tempdir/$src_state_filename"
    else
        echo "{}" > "$tempdir/$src_state_filename"
    fi
}

function sync() {
    new_source_state_file="$tempdir/new_state.json"
    readSrc | \
        tee >(jq -c -R $jq_cmd "fromjson? | select(.type == \"STATE\") | .state.data" | tail -n 1 > "$new_source_state_file") | \
        tee /dev/tty | \
        jq -c -R $jq_cmd "fromjson? | select(.type == \"RECORD\") | .record.stream |= \"${stream_prefix}\" + ." | \
        docker run -i -v "$tempdir:/configs" "$dst_docker_image" write \
        --config "/configs/$dst_config_filename" \
        --catalog "/configs/$dst_catalog_filename"
    cp "$new_source_state_file" "$src_state_filepath"
}

function readSrc() {
    docker run --rm -v "$tempdir:/configs" "$src_docker_image" read \
      --config "/configs/$src_config_filename" \
      --catalog "/configs/$src_catalog_filename" \
      --state "/configs/$src_state_filename"
}

function checkSrc() {
    if [ "$check_src_connection" = true ]; then
        echo "Validating connection to source..."
        connectionStatusInfo=$(docker run --rm -v "$tempdir:/configs" "$src_docker_image" check --config "/configs/$src_config_filename")
        connectionStatus=$(echo "$connectionStatusInfo" | jq -r '.connectionStatus.status')
        if [ "$connectionStatus" != 'SUCCEEDED' ]; then
            echo $(echo "$connectionStatusInfo" | jq -r '.connectionStatus.message')
            exit 1;
        fi
        echo "Connection validation successful"
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
    echo "Pulling source image $src_docker_image"
    docker pull $src_docker_image
    writeSrcConfig
    writeSrcCatalog
    echo "Pulling destination image $dst_docker_image"
    docker pull $dst_docker_image
    writeDstConfig
    writeDstCatalog
    checkSrc
    loadState

    if [ "$run_src_only" = true ]; then
        echo -e "\nOnly running source"
        readSrc
    else
        echo -e "\nRunning source and passing output to destination"
        sync
    fi
}

main "$@"; exit
