#!/usr/bin/env bash

set -eo pipefail

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
RED='\u001b[31m'
GREEN='\u001b[32m'
YELLOW='\u001b[33m'
BLUE='\u001b[34m'
CYAN='\u001b[36m'
NC='\033[0m' # No Color

JQ_TIMESTAMP="(now|strflocaltime(\"%H:%M:%S - \"))"

function help() {
    echo
    echo "usage:"
    echo
    echo "./airbyte-local.sh --src <image> --dst <image> [options]"
    echo
    echo "options:"
    echo
    echo "--src <image> (required)          Airbyte source Docker image"
    echo "--dst <image> (required)          Airbyte destination Docker image"
    echo "--src.<key> <value>               Add \"key\": \"value\" into the source config" 
    echo "--dst.<key> <value>               Add \"key\": \"value\" into the destination config"
    echo "--check-connection                Validate the Airbyte source connection"
    echo "--full-refresh                    Force full_refresh and overwrite mode"
    echo "--state <path>                    Override state file path for incremental sync"
    echo "--src-catalog-overrides <json>    JSON string of sync mode overrides"
    echo "--src-catalog-file <path>         Source catalog file path"
    echo "--src-catalog-json <json>         Source catalog as a JSON string"
    echo "--dst-catalog-file <path>         Destination catalog file path"
    echo "--dst-catalog-json <json>         Destination catalog as a JSON string"
    echo "--dst-stream-prefix <prefix>      Destination stream prefix"
    echo "--no-src-pull                     Skip pulling Airbyte source image"
    echo "--no-dst-pull                     Skip pulling Airbyte destination image"
    echo "--src-only                        Only run the Airbyte source"
    echo "--connection-name                 Connection name used in various places"
    echo "--max-log-size <size>             Set Docker maximum log size"
    echo "--memory <mem>                    Set Docker maximum amount of memory each container can use, e.g \"1g\""
    echo "--cpus <cpus>                     Set Docker maximum CPUs each container can use, e.g \"1\""
    echo "--debug                           Enable debug logging"
    exit
}

function setDefaults() {
    declare -Ag src_config=()
    declare -Ag dst_config=()
    src_catalog_overrides="{}"
    max_log_size="10m"
    memory=""
    cpus=""
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
            --src-catalog-overrides)
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
                keys=( "${strarr[@]:1}" )
                key=$(IFS=.; echo "${keys[*]}")
                val="$2"
                src_config[$key]="${val}"
                shift 2 ;;
            --dst.*)
                IFS='.' read -ra strarr <<< $1
                keys=( "${strarr[@]:1}" )
                key=$(IFS=.; echo "${keys[*]}")
                val="$2"
                dst_config[$key]="${val}"
                shift 2 ;;
            --src-only)
                run_src_only=1
                shift 1 ;;
            --check-connection)
                check_src_connection=1
                shift 1 ;;
            --full-refresh)
                full_refresh=true
                shift 1 ;;
            --no-src-pull)
                no_src_pull=1
                shift 1 ;;
            --no-dst-pull)
                no_dst_pull=1
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
            --memory)
                memory="-m $2"
                shift 2 ;;
            --cpus)
                cpus="--cpus $2"
                shift 2 ;;
            --debug)
                debug=1
                shift 1 ;;
            --help)
                help ;;
            *)
                warn "Unrecognized arg: $1"
                shift ;;
        esac
    done
}

function validateInput() {
    if [[ -z "$src_docker_image" ]]; then
        err "Airbyte source Docker image must be set using '--src <image>'"
    fi
    if [[ -z "$dst_docker_image" ]] && ! ((run_src_only)); then
        err "Airbyte destination Docker image must be set using '--dst <image>'"
    fi
}

function writeSrcConfig() {
    writeConfig src_config "$tempdir/$src_config_filename"
    debug "Using source config: $(jq -c < $tempdir/$src_config_filename)"
}

function writeDstConfig() {
    if [[ $dst_docker_image == farosai/airbyte-faros-destination* ]]; then
        # TODO: support CE
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
    debug "Using destination config: $(jq -c < $tempdir/$dst_config_filename)"
}

function writeConfig() {
    local -n config=$1
    # Inspired by https://stackoverflow.com/questions/44792241/constructing-a-json-hash-from-a-bash-associative-array
    for key in "${!config[@]}"; do
        printf '%s\0%s\0' "$key" "${config[$key]}"
    done |
    jq -Rs '
      split("\u0000")
      | . as $a
      | reduce range(0; length/2) as $i
          ({}; . * setpath(($a[2*$i] / ".");($a[2*$i + 1]|fromjson? // if . == "true" then true elif . == "false" then false else . end)))' > "$2"
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
        discoverSrc |
            tee >(jq -cR "fromjson? | select(.type != \"CATALOG\")" >&2) |
            jq --arg full_refresh "$full_refresh" \
               --argjson src_catalog_overrides "$src_catalog_overrides" '{
              streams: [
                .catalog.streams[]
                  | select($src_catalog_overrides[.name].disabled != true)
                  | .incremental = ((.supported_sync_modes|contains(["incremental"])) and ($src_catalog_overrides[.name].sync_mode != "full_refresh") and ($full_refresh != "true"))
                  | {
                      stream: {name: .name, json_schema: {}},
                      sync_mode: (if .incremental then "incremental" else "full_refresh" end),
                      destination_sync_mode: ($src_catalog_overrides[.name].destination_sync_mode? // if .incremental then "append" else "overwrite" end)
                    }
              ]
            }' > $tempdir/$src_catalog_filename
    fi
    debug "Using source configured catalog: $(jq -c < $tempdir/$src_catalog_filename)"
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

function checkSrc() {
    if ((check_src_connection)); then
        log "Validating connection to source..."
        connectionStatusInfo=$(docker run --rm -v "$tempdir:/configs" "$src_docker_image" check --config "/configs/$src_config_filename")
        connectionStatus=$(echo "$connectionStatusInfo" | jq -r '.connectionStatus.status')
        if [[ "$connectionStatus" != 'SUCCEEDED' ]]; then
            err $(echo "$connectionStatusInfo" | jq -r '.connectionStatus.message')
        fi
        log "Connection validation successful"
    fi
}

function discoverSrc() {
    docker run --rm -v "$tempdir:/configs" "$src_docker_image" discover \
      --config "/configs/$src_config_filename"
}

function readSrc() {
    docker run $memory $cpus --init --cidfile="$tempdir/src_cid" --rm -v "$tempdir:/configs" --log-opt max-size="$max_log_size" -a stdout -a stderr "$src_docker_image" read \
      --config "/configs/$src_config_filename" \
      --catalog "/configs/$src_catalog_filename" \
      --state "/configs/$src_state_filename"
}

function sync() {
    new_source_state_file="$tempdir/new_state.json"
    readSrc |
        tee >(jq -cCR --unbuffered 'fromjson? | select(.type != "RECORD" and .type != "STATE")' |
            jq -rR --unbuffered " \"${GREEN}[SRC]: \" + ${JQ_TIMESTAMP} + ." >&2) |
        jq -cR --unbuffered "fromjson? | select(.type == \"RECORD\" or .type == \"STATE\") | .record.stream |= \"${dst_stream_prefix}\" + ." |
        docker run $memory $cpus --cidfile="$tempdir/dst_cid" --rm -i --init -v "$tempdir:/configs" --log-opt max-size="$max_log_size" -a stdout -a stderr -a stdin "$dst_docker_image" write \
        --config "/configs/$dst_config_filename" --catalog "/configs/$dst_catalog_filename" |
        tee >(jq -cR --unbuffered 'fromjson? | select(.type == "STATE") | .state.data' | tail -n 1 > "$new_source_state_file") |
        # https://stedolan.github.io/jq/manual/#Colors
        JQ_COLORS="1;30:0;37:0;37:0;37:0;36:1;37:1;37" \
        jq -cCR --unbuffered 'fromjson?' | jq -rR " \"${CYAN}[DST]: \" + ${JQ_TIMESTAMP} + ."
    cp "$new_source_state_file" "$src_state_filepath"
}

function cleanup() {
    if [[ -s "$tempdir/src_cid" ]]; then
        docker container kill $(cat "$tempdir/src_cid") 2>/dev/null || true
    fi
    if [[ -s "$tempdir/dst_cid" ]]; then
        docker container kill $(cat "$tempdir/dst_cid") 2>/dev/null || true
    fi
    rm -rf "$tempdir"
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

main() {
    setDefaults
    parseFlags "$@"
    validateInput
    tempdir=$(mktemp -d)
    trap cleanup EXIT
    trap cleanup SIGINT
    echo "Created folder $tempdir for temporary Airbyte files"

    if ((no_src_pull)); then
        log "Skipping pull of source image $src_docker_image"
    else
        log "Pulling source image $src_docker_image"
        docker pull $src_docker_image
    fi
    writeSrcConfig
    writeSrcCatalog

    checkSrc
    if ((run_src_only)); then
        log "Only running source"
        loadState
        readSrc | jq -cCR --unbuffered 'fromjson?' | jq -rR "\"${GREEN}[SRC]: \" + ${JQ_TIMESTAMP} + ."
    else
        if ((no_dst_pull)); then
            log "Skipping pull of destination image $dst_docker_image"
        else
            log "Pulling destination image $dst_docker_image"
            docker pull $dst_docker_image
        fi
        parseStreamPrefix
        loadState
        writeDstConfig
        writeDstCatalog

        log "Running ${GREEN}source [SRC]${NC} and passing output to ${CYAN}destination [DST]${NC}"
        sync
    fi
    log "Done"
}

main "$@"; exit
