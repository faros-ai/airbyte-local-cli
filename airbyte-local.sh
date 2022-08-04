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

# Theme
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function setDefaults() {
    declare -Ag src_config=()
    declare -Ag dst_config=()
    src_catalog_overrides="{}"
    max_log_size="10m"
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
            --src-catalog)
                src_catalog_overrides="$2"
                shift 2 ;;
            --src-catalog-file)
                src_catalog_file="$2"
                shift 2 ;;
            --src-catalog-json)
                src_catalog_json="$2"
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
            --full-refresh)
                full_refresh=true
                shift 1 ;;
            --no-src-pull)
                no_src_pull=true
                shift 1 ;;
            --no-dst-pull)
                no_dst_pull=true
                shift 1 ;;
            --connection-name)
                connection_name="$2"
                shift 2 ;;
            --dst-stream-prefix)
                dst_stream_prefix="$2"
                shift 2 ;;
            --dst-catalog-file)
                dst_catalog_file="$2"
                shift 2 ;;
            --dst-catalog-json)
                dst_catalog_json="$2"
                shift 2 ;;
            --max-log-size)
                max_log_size="$2"
                shift 2 ;;
            --debug)
                debug=1
                shift 1 ;;
            *)
                POSITION+=("$1")
                shift ;;
        esac
    done
}

function writeSrcConfig() {
    writeConfig src_config "$tempdir/$src_config_filename"
}

function discoverSrc() {
    docker run --rm -v "$tempdir:/configs" "$src_docker_image" discover \
      --config "/configs/$src_config_filename"
}

function writeSrcCatalog() {
    if [[ "$src_catalog_file" ]]; then
        if [[ -s "$src_catalog_file" ]]; then
            cp "$src_catalog_file" "$tempdir/$src_catalog_filename"
        else
            err "Source catalog file $src_catalog_file doesn't exist"
        fi
    elif [[ "$src_catalog_json" ]]; then
        echo "$src_catalog_json" > "$tempdir/$src_catalog_filename"
    else
        discoverSrc | \
            tee >(jq -c -R $jq_cmd "fromjson? | select(.type != \"CATALOG\")" 1>&2) | \
            jq --arg full_refresh "$full_refresh" \
               --argjson src_catalog_overrides "$src_catalog_overrides" '{
              streams: [
                .catalog.streams[]
                  | select($src_catalog_overrides[.name] != "disabled")
                  | .incremental = ((.supported_sync_modes|contains(["incremental"])) and ($src_catalog_overrides[.name] != "full_refresh") and ($full_refresh != "true"))
                  | {
                      stream: {name: .name},
                      sync_mode: (if .incremental then "incremental" else "full_refresh" end),
                      destination_sync_mode: (if .incremental then "append" else "overwrite" end)
                    }
              ]
            }' > $tempdir/$src_catalog_filename
    fi
    debug "Using source configured catalog: $(jq -c < $tempdir/$src_catalog_filename)"
}

function parseStreamPrefix() {
    IFS='-' read -ra src_docker_image_parts <<< $src_docker_image
    if [[ $dst_docker_image == farosai/airbyte-faros-destination* ]]; then
        if [[ ${src_docker_image_parts[0]} == farosai/airbyte ]]; then
            # Remove first and last elements
            src_docker_image_parts=("${src_docker_image_parts[@]:1}")
            src_docker_image_parts=("${src_docker_image_parts[@]::${#src_docker_image_parts[@]}-1}");

            [ -z "$connection_name" ] && connection_name="my$(IFS= ; echo "${src_docker_image_parts[*]}")src"
            src_type=$(IFS=_ ; echo "${src_docker_image_parts[*]}")
            dst_stream_prefix="${connection_name}__${src_type}__"
        elif [[ -z "$dst_stream_prefix" ]]; then
            err "$dst_docker_image requires a destination stream prefix. Specify this by adding '--dst-stream-prefix <value>'"
        fi
    fi
}

# TODO: support CE
function writeDstConfig() {
    if [[ $dst_docker_image == farosai/airbyte-faros-destination* ]]; then
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
    fi

    writeConfig dst_config "$tempdir/$dst_config_filename"
}

function writeConfig() {
    local -n config=$1
    # https://stackoverflow.com/questions/44792241/constructing-a-json-hash-from-a-bash-associative-array
    for key in "${!config[@]}"; do
        printf '%s\0%s\0' "$key" "${config[$key]}"
    done |
    jq -Rs '
      split("\u0000")
      | . as $a
      | reduce range(0; length/2) as $i
          ({}; . + {($a[2*$i]): ($a[2*$i + 1]|fromjson? // if . == "true" then true elif . == "false" then false else . end)})' > "$2"
}

function writeDstCatalog() {
    if [[ "$dst_catalog_file" ]]; then
        if [[ -s "$dst_catalog_file" ]]; then
            cp "$dst_catalog_file" "$tempdir/$dst_catalog_filename"
        else
            err "Destination catalog file $dst_catalog_file doesn't exist"
        fi
    elif [[ "$dst_catalog_json" ]]; then
        echo "$dst_catalog_json" > "$tempdir/$dst_catalog_filename"
    else
        cat "$tempdir/$src_catalog_filename" | jq ".streams[].stream.name |= \"${dst_stream_prefix}\" + ." > "$tempdir/$dst_catalog_filename"
    fi
    debug "Using destination configured catalog: $(jq -c < $tempdir/$dst_catalog_filename)"
}

function loadState() {
    if [[ -z "$src_state_filepath" ]]; then
        if [[ -z "$connection_name" ]]; then
            src_state_filepath="state.json"
        else
            src_state_filepath="${connection_name}__state.json"
        fi
    fi
    log "Using state file: $src_state_filepath"
    if [[ -s "$src_state_filepath" ]]; then
        cat "$src_state_filepath" > "$tempdir/$src_state_filename"
    else
        echo "{}" > "$tempdir/$src_state_filename"
    fi
}

function sync() {
    new_source_state_file="$tempdir/new_state.json"
    readSrc | \
        tee >(jq -c -R $jq_cmd "fromjson? | select(.type == \"STATE\") | .state.data" | tail -n 1 > "$new_source_state_file") | \
        tee >(jq -c -R $jq_cmd "fromjson? | select(.type != \"RECORD\" and .type != \"STATE\")" 1>&2) | \
        jq -c -R $jq_cmd "fromjson? | select(.type == \"RECORD\") | .record.stream |= \"${dst_stream_prefix}\" + ." | \
        docker run -i -v "$tempdir:/configs" --log-opt max-size="$max_log_size" "$dst_docker_image" write \
        --config "/configs/$dst_config_filename" \
        --catalog "/configs/$dst_catalog_filename"
    cp "$new_source_state_file" "$src_state_filepath"
}

function readSrc() {
    docker run --rm -v "$tempdir:/configs" --log-opt max-size="$max_log_size" "$src_docker_image" read \
      --config "/configs/$src_config_filename" \
      --catalog "/configs/$src_catalog_filename" \
      --state "/configs/$src_state_filename"
}

function checkSrc() {
    if [[ "$check_src_connection" = true ]]; then
        log "Validating connection to source..."
        connectionStatusInfo=$(docker run --rm -v "$tempdir:/configs" "$src_docker_image" check --config "/configs/$src_config_filename")
        connectionStatus=$(echo "$connectionStatusInfo" | jq -r '.connectionStatus.status')
        if [[ "$connectionStatus" != 'SUCCEEDED' ]]; then
            err $(echo "$connectionStatusInfo" | jq -r '.connectionStatus.message')
        fi
        log "Connection validation successful"
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
    if [[ "$no_src_pull" = true ]]; then
        log "Skipping pull of source image $src_docker_image"
    else
        log "Pulling source image $src_docker_image"
        docker pull $src_docker_image
    fi
    writeSrcConfig
    writeSrcCatalog
    parseStreamPrefix
    if [[ "$no_dst_pull" = true ]]; then
        log "Skipping pull of destination image $dst_docker_image"
    else
        log "Pulling destination image $dst_docker_image"
        docker pull $dst_docker_image
    fi
    writeDstConfig
    writeDstCatalog
    checkSrc
    loadState

    if [[ "$run_src_only" = true ]]; then
        log "Only running source"
        readSrc
    else
        log "Running source and passing output to destination"
        sync
    fi
}

function fmtLog(){
    fmtTime="[$(jq -r -n 'now|strflocaltime("%Y-%m-%d %T")')]"
    if [ "$1" == "error" ]; then
        fmtLog="$fmtTime ${RED}ERROR${NC} "
    elif [ "$1" == "warn" ]; then
        fmtLog="$fmtTime ${YELLOW}WARN${NC} "
    elif [ "$1" == "debug" ]; then
        fmtLog="$fmtTime ${GREEN}DEBUG${NC} "
    else
        fmtLog="$fmtTime ${BLUE}INFO${NC} "
    fi
}

function printLog() {
    printf "$fmtLog"
    printf "$* \n"
}

function debug() {
    if ((debug)); then
        fmtLog "debug"
        printLog "$*"
    fi
}


function log() {
    fmtLog "info"
    printLog "$*"
}

function warn() {
    fmtLog "warn"
    printLog "$*"
}

function err() {
    fmtLog "error"
    printLog "$*"
    exit 1
}

main "$@"; exit
