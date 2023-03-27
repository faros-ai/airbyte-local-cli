#!/usr/bin/env bash

set -eo pipefail

bash_major_version="${BASH_VERSINFO:-0}"
[ "$bash_major_version" -ge 4 ] || { echo "Error: Bash 4.0 or higher is required." && exit 1; }

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

# Avoid using strflocaltime on Windows since it fails
# with uspecified errors on some systems
if [[ "$OSTYPE" == "win32" ]]; then
  JQ_TIMESTAMP="(now|todate + \" - \")"
else
  JQ_TIMESTAMP="(now|strflocaltime(\"%H:%M:%S - \"))"
fi

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
    echo "--src-output-file <path>          Write source output as a file (handy for debugging)"
    echo "--src-catalog-overrides <json>    JSON string of sync mode overrides"
    echo "--src-catalog-file <path>         Source catalog file path"
    echo "--src-catalog-json <json>         Source catalog as a JSON string"
    echo "--dst-catalog-file <path>         Destination catalog file path"
    echo "--dst-catalog-json <json>         Destination catalog as a JSON string"
    echo "--dst-stream-prefix <prefix>      Destination stream prefix"
    echo "--dst-use-host-network            Use the host network when running the Airbyte destination"
    echo "--no-src-pull                     Skip pulling Airbyte source image"
    echo "--no-dst-pull                     Skip pulling Airbyte destination image"
    echo "--src-only                        Only run the Airbyte source"
    echo "--dst-only <file>                 Use a file for destination input instead of a source"
    echo "--connection-name                 Connection name used in various places"
    echo "--keep-containers                 Do not remove source and destination containers after they exit"
    echo "--log-level                       Set level of source and destination loggers"
    echo "--raw-messages                    Output raw Airbyte messages, i.e., without a log prefix or colors (useful when used with --dst-only)"
    echo "--max-log-size <size>             Set Docker maximum log size"
    echo "--max-mem <mem>                   Set maximum amount of memory each Docker container can use, e.g \"1g\""
    echo "--max-cpus <cpus>                 Set maximum CPUs each Docker container can use, e.g \"1\""
    echo '--src-docker-options "<string>"   Set additional options to pass to the "docker run <src>" command'
    echo '--dst-docker-options "<string>"   Set additional options to pass to the "docker run <dst>" command'
    echo "--debug                           Enable debug logging"
    exit
}

function setDefaults() {
    declare -Ag src_config=()
    declare -Ag dst_config=()
    keep_containers="--rm"
    log_level="info"
    max_cpus=""
    max_log_size="10m"
    max_memory=""
    src_catalog_overrides="{}"
    dst_use_host_network=""
    src_docker_options=""
    dst_docker_options=""
    output_filepath="/dev/null"
    jq_src_msg="\"${GREEN}[SRC]: \" + ${JQ_TIMESTAMP} + ."
    jq_dst_msg="\"${CYAN}[DST]: \" + ${JQ_TIMESTAMP} + ."
    jq_color_opt="-C"
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
            --src-output-file)
                output_filepath="$2"
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
            --src-config-file)
                src_config_file="$2"
                shift 2 ;;
            --src-config-json)
                src_config_json="$2"
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
            --dst-only)
                src_file="$2"
                no_src_pull=1
                shift 2 ;;
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
            --dst-config-file)
                dst_config_file="$2"
                shift 2 ;;
            --dst-config-json)
                dst_config_json="$2"
                shift 2 ;;
            --dst-use-host-network)
                dst_use_host_network="--network host"
                shift 1 ;;
            --max-log-size)
                max_log_size="$2"
                shift 2 ;;
            --log-level)
                log_level="$2"
                shift 2 ;;
            --raw-messages)
                # Passthrough
                jq_src_msg="."
                jq_dst_msg="."
                jq_color_opt="-M"
                shift 1 ;;
            --keep-containers)
                keep_containers=""
                shift 1 ;;
            --max-mem)
                max_memory="-m $2"
                shift 2 ;;
            --max-cpus)
                max_cpus="--cpus $2"
                shift 2 ;;
            --src-docker-options)
                src_docker_options="$2"
                shift 2 ;;
            --dst-docker-options)
                dst_docker_options="$2"
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
    if [[ "$src_config_file" ]]; then
        cp "$src_config_file" "$tempdir/$src_config_filename"
    elif [[ "$src_config_json" ]]; then
        echo "$src_config_json" > "$tempdir/$src_config_filename"
    else
        writeConfig src_config "$tempdir/$src_config_filename"
    fi
    if ((debug)); then
        debug "Using source config: $(redactConfigSecrets "$(jq -c < $tempdir/$src_config_filename)" "$(specSrc)")"
    fi
}

function writeDstConfig() {
    if [[ "$dst_config_file" ]]; then
        cp "$dst_config_file" "$tempdir/$dst_config_filename"
    elif [[ "$dst_config_json" ]]; then
        echo "$dst_config_json" > "$tempdir/$dst_config_filename"
    else
        writeConfig dst_config "$tempdir/$dst_config_filename"
    fi
    if ((debug)); then
        debug "Using destination config: $(redactConfigSecrets "$(jq -c < $tempdir/$dst_config_filename)" "$(specDst)")"
    fi
}

function writeConfig() {
    if ((use_eval)); then
        var=$(declare -p "$1")
        eval "declare -A config=${var#*=}"
    else
        local -n config=$1
    fi
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

# Constructs paths to fields that should be redacted using Airbyte spec and then redacts them from the config
# $1      - Config with secrets to redact
# $2      - Airbyte spec that defines which fields are "airbyte_secret"
# returns - Config with redacted secrets
function redactConfigSecrets() {
    loggable_config="$1"
    config_properties="$(echo "$2" | jq -r '.spec.connectionSpecification.properties')"
    paths_to_redact=($(jq -c --stream 'if .[0][-1] == "airbyte_secret" and .[1] then .[0] else null end 
                                       | select(. != null) 
                                       | .[0:-1] 
                                       | map(select(. != "properties" and 
                                                    . != "oneOf" and
                                                    . != "anyOf" and
                                                    (.|tostring|test("^\\d+$")|not)))' <<< "$config_properties"))
    for path in "${paths_to_redact[@]}"; do\
        loggable_config="$(jq -c --argjson path "$path" 'if getpath($path) != null then setpath($path; "REDACTED") else . end' <<< "$loggable_config")"
    done
    echo "$loggable_config"
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
                      stream: {name: .name, supported_sync_modes: .supported_sync_modes, json_schema: {}},
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
        if [[ ${src_docker_image_parts[0]} == farosai/airbyte ]] && [[ -z "$dst_stream_prefix" ]]; then
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
        connectionStatusInfo=$(docker run --rm -v "$tempdir:/configs" $src_docker_options "$src_docker_image" check --config "/configs/$src_config_filename" | grep "CONNECTION_STATUS")
        connectionStatus=$(echo "$connectionStatusInfo" | jq -r '.connectionStatus.status')
        if [[ "$connectionStatus" != 'SUCCEEDED' ]]; then
            err $(echo "$connectionStatusInfo" | jq -r '.connectionStatus.message')
        fi
        log "Connection validation successful"
    fi
}

function specSrc() {
    docker run --rm "$src_docker_image" spec
}

function discoverSrc() {
    docker run --rm -v "$tempdir:/configs" "$src_docker_image" discover \
      --config "/configs/$src_config_filename"
}

function readSrc() {
    if [[ "$src_file" ]]; then
        cat $src_file
    else
        docker run $keep_containers $max_memory $max_cpus --init --cidfile="$tempdir/src_cid" -v "$tempdir:/configs" --log-opt max-size="$max_log_size" -a stdout -a stderr --env LOG_LEVEL="$log_level" $src_docker_options "$src_docker_image" read \
          --config "/configs/$src_config_filename" \
          --catalog "/configs/$src_catalog_filename" \
          --state "/configs/$src_state_filename"
    fi
}

function specDst() {
    docker run --rm "$dst_docker_image" spec
}

function sync() {
    debug "Writing source output to $output_filepath"
    new_source_state_file="$tempdir/new_state.json"
    readSrc |
        tee >(jq -cR $jq_color_opt --unbuffered 'fromjson? | select(.type != "RECORD" and .type != "STATE")' |
            jq -rR --unbuffered "$jq_src_msg" >&2) |
        jq -cR --unbuffered "fromjson? | select(.type == \"RECORD\" or .type == \"STATE\") | .record.stream |= \"${dst_stream_prefix}\" + ." |
        tee "$output_filepath" |
        docker run $keep_containers $dst_use_host_network $max_memory $max_cpus --cidfile="$tempdir/dst_cid" -i --init -v "$tempdir:/configs" --log-opt max-size="$max_log_size" -a stdout -a stderr -a stdin --env LOG_LEVEL="$log_level" $dst_docker_options "$dst_docker_image" write \
        --config "/configs/$dst_config_filename" --catalog "/configs/$dst_catalog_filename" |
        tee >(jq -cR --unbuffered 'fromjson? | select(.type == "STATE") | .state.data' | tail -n 1 > "$new_source_state_file") |
        # https://stedolan.github.io/jq/manual/#Colors
        JQ_COLORS="1;30:0;37:0;37:0;37:0;36:1;37:1;37" \
        jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_dst_msg"
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

function checkBashVersion() {
    bash_minor_version=$(echo "${BASH_VERSION}" | cut -d '.' -f 2)
    if [ $bash_major_version -eq 4 ] && [ $bash_minor_version -lt 3 ]; then
        warn "Bash version ${BASH_VERSION} detected."
        warn "This requires the use of the dangerous eval() function to manage connector config objects."
        warn "We recommend you upgrade bash to at least version 4.3 to remove this requirement."
        use_eval=1
    fi
}

main() {
    checkBashVersion
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
        readSrc | jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_src_msg"
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
