#!/usr/bin/env bash

set -eo pipefail

bash_major_version="${BASH_VERSINFO:-0}"
[ "$bash_major_version" -ge 4 ] || { echo "Error: Bash 4.0 or higher is required." && exit 1; }

declare -a required_cmds=("jq")
for i in "${required_cmds[@]}"; do
    which "$i" &> /dev/null ||
        { echo "Error: $i is required." && missing_require=1; }
done

if ((${missing_require:-0})); then
    echo "Please ensure jq is available before running the script."
    exit 1
fi

filename_prefix=faros_airbyte_cli
src_config_filename=${filename_prefix}_src_config.json
src_state_filename=${filename_prefix}_src_state.json
src_catalog_filename=${filename_prefix}_src_catalog.json
dst_config_filename=${filename_prefix}_dst_config.json
dst_catalog_filename=${filename_prefix}_dst_catalog.json

JQ_TIMESTAMP="(now|todate)"

# Workaround for Docker for Windows in Git Bash
# https://github.com/docker-archive/toolbox/issues/673
if ! [[ "$OSTYPE" =~ ^darwin || "$OSTYPE" =~ ^linux ]]; then
    export MSYS_NO_PATHCONV=1
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
    echo "--full-refresh                    Force full_refresh and overwrite mode"
    echo "--state <path>                    Override state file path for incremental sync"
    echo "--src-output-file <path>          Write source output as a file (handy for debugging, requires a destination)"
    echo "--src-catalog-overrides <json>    JSON string of sync mode overrides"
    echo "--src-catalog-file <path>         Source catalog file path"
    echo "--src-catalog-json <json>         Source catalog as a JSON string"
    echo "--dst-catalog-file <path>         Destination catalog file path"
    echo "--dst-catalog-json <json>         Destination catalog as a JSON string"
    echo "--dst-stream-prefix <prefix>      Destination stream prefix"
    echo "--connection-name                 Connection name used in various places"
    echo "--keep-containers                 Do not remove source and destination containers after they exit"
    echo "--log-level                       Set level of source and destination loggers"
    echo "--raw-messages                    Output raw Airbyte messages, i.e., without a log prefix or colors (useful when used with --dst-only)"
    echo "--max-log-size <size>             Set Docker maximum log size"
    echo "--max-mem <mem>                   Set maximum amount of memory each Docker container can use, e.g \"1g\""
    echo "--max-cpus <cpus>                 Set maximum CPUs each Docker container can use, e.g \"1\""
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
    pod_name=""
    src_catalog_overrides="{}"
    kube_namespace="default"
    output_filepath="/dev/null"
    jq_src_msg="\"${GREEN}[SRC]: \" + ${JQ_TIMESTAMP} + \" - \" + ."
    jq_dst_msg="\"${CYAN}[DST]: \" + ${JQ_TIMESTAMP} + \" - \" + ."
    jq_color_opt="-C"
    use_colors=1
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
            --full-refresh)
                full_refresh=true
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
            --max-log-size)
                max_log_size="$2"
                shift 2 ;;
            --log-level)
                log_level="$2"
                shift 2 ;;
            --raw-messages)
                # Passthrough
                use_colors=0
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
            --kube-namespace)
                kube_namespace="$2"
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

function setTheme() {
    if ((use_colors)); then
        RED='\u001b[31m'
        GREEN='\u001b[32m'
        YELLOW='\u001b[33m'
        BLUE='\u001b[34m'
        CYAN='\u001b[36m'
        NC='\033[0m' # No Color
    fi
}

function validateInput() {
    if [[ -z "$src_docker_image" ]]; then
        err "Airbyte source Docker image must be set using '--src <image>'"
    fi
    if [[ -z "$dst_docker_image" ]] && ! ((run_src_only)); then
        err "Airbyte destination Docker image must be set using '--dst <image>'"
    fi
    if [[ "$output_filepath" != "/dev/null" ]] && ((run_src_only)); then
        err "'--src-output-file' cannot be used with '--src-only'. Consider using '--raw-messages' when running without a destination then redirecting to a file"
    fi
}

function writeSrcConfig() {
    if [[ "$src_config_file" ]]; then
        cp "$src_config_file" "$tempdir/$src_config_filename"
    elif [[ "$src_config_json" ]]; then
        echo "$src_config_json" > "$tempdir/$src_config_filename"
    elif ((run_src_wizard)); then
        getConfigFromWizard "$src_docker_image" "$src_config_filename"
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
        log "Source catalog will be configured in k8s pod"
        return
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
        log "Destination catalog will be configured in k8s pod"
        return
    fi
    debug "Using destination configured catalog: $(jq -c < $tempdir/$dst_catalog_filename)"
}

function parseStreamPrefix() {
    IFS='-' read -ra src_docker_image_parts <<< $src_docker_image
    if [[ $dst_docker_image == farosai/airbyte-faros-destination* ]]; then
        if [[ -z "$connection_name" ]] && [[ $src_docker_image == farosai/airbyte-faros-feeds-source* ]]; then
            # Source config may be missing if uploading from a file. In that case fallback
            # to name extracted from source image (see below).
            feed_name=$(jq -r '.feed_cfg.feed_name // empty' "$tempdir/$src_config_filename")
            if [[ -n "$feed_name" ]]; then
                connection_name=${feed_name%"-feed"}
            fi
        fi

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

function generateKubeManifest() {
    local pod_name_placeholder=POD_NAME_PLACEHOLDER
    local dst_stream_placeholder=DST_STREAM_PREFIX_PLACEHOLDER
    local src_docker_image_placeholder=SRC_DOCKER_IMAGE_PLACEHOLDER
    local dst_docker_image_placeholder=DST_DOCKER_IMAGE_PLACEHOLDER
    local src_catalog_overrides_placeholder=SRC_CATALOG_OVERRIDES_PLACEHOLDER
    local full_refresh_placeholder=FULL_REFRESH_PLACEHOLDER
    local manifest_template=$1
    local manifest_file=$2

    # Use ~ as delimeter because image name may contain "/"
    sed "s~${dst_stream_placeholder}~${dst_stream_prefix}~" $manifest_template \
    | sed "s~${src_docker_image_placeholder}~${src_docker_image}~" \
    | sed "s~${dst_docker_image_placeholder}~${dst_docker_image}~" \
    | sed "s~${src_catalog_overrides_placeholder}~${src_catalog_overrides}~" \
    | sed "s~${full_refresh_placeholder}~${full_refresh}~" \
    | sed "s~${pod_name_placeholder}~${pod_name}~" \
    > ${manifest_file}
}

function waitForPodContainer() {
    local namespace=$1
    local pod=$2
    local container=$3
    local state=$4
    container_status=""
    while [ -z "$container_status" ]
    do
        container_status=$(kubectl get pod $pod -n $namespace -o jsonpath="{.status.containerStatuses[?(@.name==\"$container\")].state.$state}" || True)
        if [ -z "$container_status" ]; then # check also init container status
            container_status=$(kubectl get pod $pod -n $namespace -o jsonpath="{.status.initContainerStatuses[?(@.name==\"$container\")].state.$state}" || True)
        fi
        log "Waiting for container $container in pod $pod to be in state $state, $status"
        sleep 2
    done
}

function generatePodName() {
    local name
    name=${src_docker_image##*/} # remove everything until last "/"
    name=${name%%:*} # remove tag if present
    name=faros-${name//_/\-}-$(date +%s) # replace "_" with "-"" and add prefix faros-
    echo $name
}

function sync() {
    local kube_manifest_template=connection-pod.yaml
    kube_manifest_tmp=__${kube_manifest_template}
    pod_name=$(generatePodName)
    local pod=$pod_name
    local namespace=$kube_namespace
    local src_container=source
    local dst_container=destination
    local state_container=transformer
    local new_state_file=new_state.json

    # Copy manifest template to tmp file, replacing placeholders with actual values
    generateKubeManifest ${kube_manifest_template} ${kube_manifest_tmp}
    kubectl apply -f ${kube_manifest_tmp} -n ${namespace}
    # Wait for init container to start up
    waitForPodContainer $namespace $pod init "running"
    echo "Copying config files to pod $pod"
    kubectl cp $tempdir/$src_config_filename $pod:/config/source_config.json -n ${namespace} -c init
    if [[ -s "$tempdir/$src_catalog_filename" ]]; then
        kubectl cp $tempdir/$src_catalog_filename $pod:/config/source_catalog.json -n ${namespace} -c init
    fi
    kubectl cp $tempdir/$dst_config_filename $pod:/config/destination_config.json -n ${namespace} -c init
    if [[ -s "$tempdir/$dst_catalog_filename" ]]; then
        kubectl cp $tempdir/$dst_catalog_filename $pod:/config/destination_catalog.json -n ${namespace} -c init
    fi
    kubectl cp $tempdir/$src_state_filename $pod:/config/input_state.json -n ${namespace} -c init
    kubectl cp FINISHED_UPLOADING $pod:/config/ -n ${namespace} -c init
    # Wait for source container to start up

    waitForPodContainer $namespace $pod $src_container "running"
    # Tail source logs in the background
    log "Tailing source container logs in the background"
    kubectl logs -f $pod -c $src_container -n ${namespace} | jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_src_msg" &

    waitForPodContainer $namespace $pod $dst_container "running"
    log "Tailing destination container logs in the background"
    kubectl logs -f $pod -c $dst_container -n ${namespace} | JQ_COLORS="1;30:0;37:0;37:0;37:0;36:1;37:1;37" jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_dst_msg"
    log "Copying $new_state_file from pod $pod"
    kubectl cp $pod:/config/$new_state_file $src_state_filepath -n ${namespace} -c $state_container
    kubectl cp FINISHED_DOWNLOADING $pod:/config/  -n ${namespace} -c $state_container
}

function cleanup() {
    if [[ ! -z "$keep_containers" ]]; then
        log "Deleting pod $pod_name"
        kubectl delete pod $pod_name -n $kube_namespace
    else
        log "Pod $pod_name is left on the cluster. To delte it, run 'kubectl delete pod $pod_name -n $kube_namespace'"
    fi
    rm -rf "$tempdir"
    rm "$kube_manifest_tmp"
}

function fmtLog(){
    fmtTime=$(jq -r -n "${JQ_TIMESTAMP}")
    if [ "$1" == "error" ]; then
        fmtLog="[$fmtTime] ${RED}ERROR${NC} "
    elif [ "$1" == "warn" ]; then
        fmtLog="[$fmtTime] ${YELLOW}WARN${NC} "
    elif [ "$1" == "debug" ]; then
        fmtLog="[$fmtTime] ${GREEN}DEBUG${NC} "
    else
        fmtLog="[$fmtTime] ${BLUE}INFO${NC} "
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
    setTheme
    validateInput
    tempPrefix="tmp-$(jq -r -n "now")"
    tempPath="$(pwd)/$tempPrefix"
    tempdir=$(mkdir -p $tempPath && echo $tempPath)
    trap cleanup EXIT
    trap cleanup SIGINT
    echo "Created folder $tempdir for temporary Airbyte files"

    writeSrcConfig
    writeSrcCatalog

    parseStreamPrefix
    loadState
    writeDstConfig
    writeDstCatalog

    log "Running ${GREEN}source [SRC]${NC} and passing output to ${CYAN}destination [DST]${NC}"
    sync

    log "Done"
}

main "$@"; exit
