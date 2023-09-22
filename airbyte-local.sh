#!/usr/bin/env bash

set -eo pipefail

bash_major_version="${BASH_VERSINFO:-0}"
[ "$bash_major_version" -ge 4 ] || { echo "Error: Bash 4.0 or higher is required." && exit 1; }

filename_prefix=faros_airbyte_cli
src_config_filename=${filename_prefix}_src_config.json
src_state_filename=${filename_prefix}_src_state.json
src_catalog_filename=${filename_prefix}_src_catalog.json
dst_config_filename=${filename_prefix}_dst_config.json
dst_catalog_filename=${filename_prefix}_dst_catalog.json
spec_filename=${filename_prefix}_spec.json

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
    echo "--check-connection                Validate the Airbyte source connection"
    echo "--full-refresh                    Force full_refresh and overwrite mode"
    echo "--state <path>                    Override state file path for incremental sync"
    echo "--src-output-file <path>          Write source output as a file (handy for debugging, requires a destination)"
    echo "--src-catalog-overrides <json>    JSON string of sync mode overrides"
    echo "--src-catalog-file <path>         Source catalog file path"
    echo "--src-catalog-json <json>         Source catalog as a JSON string"
    echo "--dst-catalog-file <path>         Destination catalog file path"
    echo "--dst-catalog-json <json>         Destination catalog as a JSON string"
    echo "--dst-stream-prefix <prefix>      Destination stream prefix"
    echo "--dst-use-host-network            Use the host network when running the Airbyte destination"
    echo "--no-src-pull                     Skip pulling Airbyte source image"
    echo "--no-dst-pull                     Skip pulling Airbyte destination image"
    echo "--src-wizard                      Run the Airbyte source configuration wizard"
    echo "--dst-wizard                      Run the Airbyte destination configuration wizard"
    echo "--src-only                        Only run the Airbyte source"
    echo "--dst-only <file>                 Use a file for destination input instead of a source"
    echo "--connection-name                 Connection name used in various places"
    echo "--keep-containers                 Do not remove source and destination containers after they exit"
    echo "--log-level                       Set level of source and destination loggers"
    echo "--raw-messages                    Output raw Airbyte messages, i.e., without a log prefix or colors (useful when used with --dst-only)"
    echo "--max-log-size <size>             Set Docker maximum log size"
    echo "--max-mem <mem>                   Set maximum amount of memory each Docker or Kubernetes container can use, e.g \"1g\""
    echo "--max-cpus <cpus>                 Set maximum CPUs each Docker or Kubernetes container can use, e.g \"1\""
    echo '--src-docker-options "<string>"   Set additional options to pass to the "docker run <src>" command'
    echo '--dst-docker-options "<string>"   Set additional options to pass to the "docker run <dst>" command'
    echo '--k8s-deployment"                 Run source destination connectors on a Kubernetes cluster'
    echo '--k8s-namespace "<string>"        Set Kubernetes namespace where the pod with source and destination containers will run; defaults to "default"'
    echo "--debug                           Enable debug logging"
    exit
}

function setDefaults() {
    declare -Ag src_config=()
    declare -Ag dst_config=()
    keep_containers="--rm"
    log_level="info"
    max_log_size="10m"
    max_memory=""
    max_cpus=""
    k8s_default_mem_limit="256Mi"
    k8s_default_cpu_limit="500m"
    pod_name=""
    k8s_namespace="default"
    src_catalog_overrides="{}"
    dst_use_host_network=""
    src_docker_options=""
    dst_docker_options=""
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
            --src-only)
                run_src_only=1
                shift 1 ;;
            --dst-only)
                src_file="$2"
                no_src_pull=1
                shift 2 ;;
            --src-wizard)
                run_src_wizard=1
                shift 1 ;;
            --dst-wizard)
                run_dst_wizard=1
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
                use_colors=0
                jq_src_msg="."
                jq_dst_msg="."
                jq_color_opt="-M"
                shift 1 ;;
            --keep-containers)
                keep_containers=""
                shift 1 ;;
            --k8s-deployment)
                k8s_deployment=1
                shift 1 ;;
            --k8s-namespace)
                k8s_namespace="$2"
                shift 2 ;;
            --max-mem)
                max_memory="$2"
                shift 2 ;;
            --max-cpus)
                max_cpus="$2"
                shift 2 ;;
            --src-docker-options)
                src_docker_options="$2"
                shift 2 ;;
            --dst-docker-options)
                dst_docker_options="$2"
                shift 2 ;;
            --debug)
                debug=1
                log_level="debug"
                shift 1 ;;
            --help)
                help ;;
            *)
                err "Unrecognized arg: $1" ;;
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

function validateRequirements() {
    if ((k8s_deployment)); then
        declare -a required_cmds=("kubectl" "jq")
    else
        declare -a required_cmds=("docker" "jq")
    fi
    for i in "${required_cmds[@]}"; do
        which "$i" &> /dev/null ||
            { echo "Error: $i is required." && missing_require=1; }
    done

    if ((${missing_require:-0})); then
        echo "Please ensure $required_cmds are available before running the script."
        exit 1
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
    if ((k8s_deployment)); then
        if ((check_src_connection)); then
            echo "Check connection option is not supported with kubernetes deployment"
            exit 1
        fi
        if ((run_src_wizard)); then
            echo "Source wizard is not supported with kubernetes deployment"
            exit 1
        fi
        if ((run_dst_wizard)); then
            echo "Destination wizard is not supported with kubernetes deployment"
            exit 1
        fi
        if ((run_src_only)); then
            echo "Source only run is not supported with kubernetes deployment"
            exit 1
        fi
        if [[ -n $src_file ]]; then
            echo "Destination only run is not supported with kubernetes deployment"
            exit 1
        fi
        # Ignore docker image pull flags for kube deployment
        no_src_pull=1
        no_dst_pull=1
        max_memory=${max_memory:-$k8s_default_mem_limit}
        max_cpus=${max_cpus:-$k8s_default_cpu_limit}
    else
        # when running locally format container cpu and memory limits parameters if they are provided by user
        if [[ -n "$max_cpus" ]]; then
            max_cpus="--cpus $max_cpus"
        fi
        if [[ -n "$max_memory" ]]; then
            max_memory="-m $max_memory"
        fi
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
    if [[ $src_docker_image == farosai/airbyte-faros-feeds-source* && ${debug} -eq 1 ]]; then
        echo "$(jq '.feed_cfg.debug = true' "$tempdir/$src_config_filename")" > "$tempdir/$src_config_filename"
    fi 
    if [[ -z "${k8s_deployment}" && ${debug} -eq 1 ]]; then
        debug "Using source config: $(redactConfigSecrets "$(jq -c < $tempdir/$src_config_filename)" "$(specSrc)")"
    fi
}

function copyFarosConfig() {
    if [[ $src_docker_image == farosai/airbyte-faros-feeds-source* && $dst_docker_image == farosai/airbyte-faros-destination* ]]; then
            faros_config=$(jq '{faros: {api_url: .edition_configs.api_url, api_key: .edition_configs.api_key, graph: .edition_configs.graph, graphql_api: .edition_configs.graphql_api} | with_entries(if .value==null then empty else . end)}' "$tempdir/$dst_config_filename")
            debug "Updating source config with Faros API config from destination config: $(echo "$faros_config" | jq '.faros.api_key = "REDACTED"')"
            jq --argjson faros_config "$faros_config" '$faros_config + .' "$tempdir/$src_config_filename" > "$tempdir/$src_config_filename.tmp"
            mv "$tempdir/$src_config_filename.tmp" "$tempdir/$src_config_filename"
            debug "Using source config: $(redactConfigSecrets "$(jq -c < $tempdir/$src_config_filename)" "$(specSrc)")"
    fi
}

function writeDstConfig() {
    if [[ "$dst_config_file" ]]; then
        cp "$dst_config_file" "$tempdir/$dst_config_filename"
    elif [[ "$dst_config_json" ]]; then
        echo "$dst_config_json" > "$tempdir/$dst_config_filename"
    elif ((run_dst_wizard)); then
        getConfigFromWizard "$dst_docker_image" "$dst_config_filename"
    else
        writeConfig dst_config "$tempdir/$dst_config_filename"
    fi
    if [[ -z "${k8s_deployment}" && ${debug} -eq 1 ]]; then
        debug "Using destination config: $(redactConfigSecrets "$(jq -c < $tempdir/$dst_config_filename)" "$(specDst)")"
    fi
}

function getConfigFromWizard() {
    local docker_image=$1
    local config_filename=$2
    if [[ $docker_image == farosai/* ]]; then
        docker run -it --rm -v "$tempdir:/configs" "$docker_image" airbyte-local-cli-wizard \
        --json "/configs/$config_filename"
    else
        docker run -it --rm "$docker_image" spec \
        > "$tempdir/$spec_filename"

        if [[ $src_docker_image == farosai/* ]]; then
            wizard_docker_image="$src_docker_image"
            log "Using source image $wizard_docker_image to run wizard"
        elif [[ $dst_docker_image == farosai/* ]]; then
            wizard_docker_image="$dst_docker_image"
            log "Using destination image $wizard_docker_image to run wizard"
        else
            # Use an arbitrary farosai image to run the wizard
            wizard_docker_image="farosai/airbyte-faros-graphql-source"
            log "Pulling source image $wizard_docker_image to run wizard"
            docker pull $wizard_docker_image
        fi

        docker run -it --rm -v "$tempdir:/configs" $wizard_docker_image airbyte-local-cli-wizard \
        --json "/configs/$config_filename" --spec-file "/configs/$spec_filename"
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
      rtrimstr("\u0000")
      | split("\u0000")
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
    elif ((k8s_deployment)); then
        log "Source catalog will be configured in k8s pod"
        return
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
    elif ((k8s_deployment)); then
        log "Destination catalog will be configured in k8s pod"
        return
    else
        cat "$tempdir/$src_catalog_filename" | jq ".streams[].stream.name |= \"${dst_stream_prefix}\" + ." > "$tempdir/$dst_catalog_filename"
    fi
    debug "Using destination configured catalog: $(jq -c < $tempdir/$dst_catalog_filename)"
}

function parseStreamPrefix() {
    IFS=':' read -ra src_docker_image_and_tag <<< $src_docker_image
    IFS='-' read -ra src_docker_image_parts <<< ${src_docker_image_and_tag[0]}
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

function kubeManifestTemplate() {
    cat <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $POD_NAME_PLACEHOLDER
spec:
  restartPolicy: Never
  initContainers:
    - name: init
      image: busybox
      workingDir: /config
      volumeMounts:
        - name: pipes-volume
          mountPath: /pipes
        - mountPath: /config
          name: airbyte-config
      command:
        - sh
        - -c
        - |
          mkfifo /pipes/src_out
          mkfifo /pipes/dst_in
          mkfifo /pipes/state
          mkfifo /pipes/discover
          ITERATION=0
          MAX_ITERATION=600
          DISK_USAGE=\$(du -s /config | awk '{print \$1;}')

          until [ -f FINISHED_UPLOADING -o \$ITERATION -ge \$MAX_ITERATION ]; do
            ITERATION=\$((ITERATION+1))
            LAST_DISK_USAGE=\$DISK_USAGE
            DISK_USAGE=\$(du -s /config | awk '{print \$1;}')
            if [ \$DISK_USAGE -gt \$LAST_DISK_USAGE ]; then
              ITERATION=0
            fi
            sleep 0.5
          done

          if [ -f FINISHED_UPLOADING ]; then
            echo "All files copied successfully, exiting with code 0..."
            exit 0
          else
            echo "Timeout while attempting to copy to init container, exiting with code 1..."
            exit 1
          fi
  containers:
    - name: source
      image: $SRC_DOCKER_IMAGE_PLACEHOLDER
      workingDir: "/config"
      env:
        - name: SOURCE_CONFIG
          value: source_config.json
        - name: SOURCE_CATALOG
          value: source_catalog.json
        - name: INPUT_STATE
          value: input_state.json
      command:
        - sh 
        - -c
        - |
          if [[ ! -s "\$SOURCE_CATALOG" ]]; then
            echo "Generating source catalog"
            ((eval "\$AIRBYTE_ENTRYPOINT discover --config \${SOURCE_CONFIG}") | tee /pipes/discover | grep -v '"CATALOG"') &
            CHILD_PID=\$!
            wait \$CHILD_PID
            echo "Completed generating source catalog"
            ITERATION=0
            MAX_ITERATION=10
            until [ -s "\$SOURCE_CATALOG" -o \$ITERATION -ge \$MAX_ITERATION ]; do
              ITERATION=\$((ITERATION+1))
              echo "Waiting for non-empty file \$SOURCE_CATALOG"
              sleep 0.5
            done
            if [[ ! -s "\$SOURCE_CATALOG" ]]; then
              echo "Timed out waiting for source catalog \"\$SOURCE_CATALOG\""
              exit 1
            fi
          fi
          echo "Starting source connector"
          ((eval "\$AIRBYTE_ENTRYPOINT read --config \${SOURCE_CONFIG} --catalog \${SOURCE_CATALOG} --state \${INPUT_STATE}" 2>&1 | tee /pipes/src_out) | grep -v '"type":"RECORD"' | grep -v '"type":"STATE"') &
          CHILD_PID=\$!

          echo "Source connector: Waiting on CHILD_PID \$CHILD_PID"
          wait \$CHILD_PID
          EXIT_STATUS=\$?
          echo "Source connector EXIT_STATUS: \$EXIT_STATUS"
          exit \$EXIT_STATUS
      volumeMounts:
        - name: pipes-volume
          mountPath: /pipes
        - mountPath: /config
          name: airbyte-config
      resources:
        limits:
          cpu: "${max_cpus}"
          memory: "${max_memory}"
    - name: transformer
      image: apteno/alpine-jq
      env:
        - name: DST_STREAM_PREFIX
          value: "$DST_STREAM_PREFIX_PLACEHOLDER"
        - name: NEW_STATE
          value: /config/new_state.json
        - name: SOURCE_CATALOG
          value: source_catalog.json
        - name: DESTINATION_CATALOG
          value: destination_catalog.json
        - name: src_catalog_overrides
          value: "$SRC_CATALOG_OVERRIDES_PLACEHOLDER"
        - name: full_refresh
          value: "$FULL_REFRESH_PLACEHOLDER"
      workingDir: "/config"
      command:
        - sh 
        - -c
        - |
          set -e
          if [[ ! -s "\$SOURCE_CATALOG" ]]; then
            echo "Configuring source catalog"
            cat /pipes/discover | jq --arg full_refresh "\$full_refresh" --argjson src_catalog_overrides "\$src_catalog_overrides" '{ streams: [ .catalog.streams[] | select(\$src_catalog_overrides[.name].disabled != true) | .incremental = ((.supported_sync_modes|contains(["incremental"])) and (\$src_catalog_overrides[.name].sync_mode != "full_refresh") and (\$full_refresh != "true")) | { stream: {name: .name, supported_sync_modes: .supported_sync_modes, json_schema: {}}, sync_mode: (if .incremental then "incremental" else "full_refresh" end), destination_sync_mode: (\$src_catalog_overrides[.name].destination_sync_mode? // if .incremental then "append" else "overwrite" end)}] }' > \$SOURCE_CATALOG
            cat "\$SOURCE_CATALOG" | jq ".streams[].stream.name |= \"\${DST_STREAM_PREFIX}\" + ." > "\$DESTINATION_CATALOG"
            echo "Saved source catalog in \$SOURCE_CATALOG and destination catalog in \$DESTINATION_CATALOG"
          fi
          echo "Starting processing output of source connector"
          cat /pipes/src_out | jq -cR --unbuffered "fromjson? | select(.type == \"RECORD\" or .type == \"STATE\") | .record.stream |= \"\${DST_STREAM_PREFIX}\" + ." > /pipes/dst_in
          cat /pipes/state | jq -cR --unbuffered 'fromjson? | select(.type == "STATE") | .state.data' | tail -n 1 > "\$NEW_STATE"
          echo "Completed piping state records"
          ITERATION=0
          MAX_ITERATION=300
          until [ -f FINISHED_DOWNLOADING -o \$ITERATION -ge \$MAX_ITERATION ]; do
            ITERATION=\$((ITERATION+1))
            sleep 0.5
          done
          if [ -f FINISHED_DOWNLOADING ]; then
            echo "New state downloaded successfully. Exiting ..."
            exit 0
          else
            echo "Timeout while waiting for state download"
            exit 1
          fi
      volumeMounts:
        - name: pipes-volume
          mountPath: /pipes
        - mountPath: /config
          name: airbyte-config
    - name: destination
      image: $DST_DOCKER_IMAGE_PLACEHOLDER
      workingDir: "/config"
      env:
        - name: DESTINATION_CONFIG
          value: destination_config.json
        - name: DESTINATION_CATALOG
          value: destination_catalog.json
      command:
        - sh 
        - -c
        - |
          ((eval "\$AIRBYTE_ENTRYPOINT write --config \${DESTINATION_CONFIG} --catalog \${DESTINATION_CATALOG}" 2>&1 | tee /pipes/state) < /pipes/dst_in) &
          CHILD_PID=\$!

          echo "Destination connector: waiting on CHILD_PID \$CHILD_PID"
          wait \$CHILD_PID
          EXIT_STATUS=\$?
          echo "Destination connector EXIT_STATUS: \$EXIT_STATUS"
          exit \$EXIT_STATUS
      volumeMounts:
        - name: pipes-volume
          mountPath: /pipes
        - mountPath: /config
          name: airbyte-config
      resources:
        limits:
          cpu: "${max_cpus}"
          memory: "${max_memory}"
  volumes:
    - name: pipes-volume
      emptyDir: {}
    - name: airbyte-config
      emptyDir:
        medium: Memory
EOF
}

function generateKubeManifest() {
    POD_NAME_PLACEHOLDER=${pod_name}
    DST_STREAM_PREFIX_PLACEHOLDER=${dst_stream_prefix}
    SRC_DOCKER_IMAGE_PLACEHOLDER=${src_docker_image}
    DST_DOCKER_IMAGE_PLACEHOLDER=${dst_docker_image}
    SRC_CATALOG_OVERRIDES_PLACEHOLDER=${src_catalog_overrides}
    FULL_REFRESH_PLACEHOLDER=${full_refresh}
    local manifest_file=$1


    kubeManifestTemplate > "${manifest_file}"
}

function waitForPodContainer() {
    local namespace=$1
    local pod=$2
    local container=$3
    local state=$4
    container_status=""
    while [ -z "$container_status" ]
    do
        container_status=$(kubectl get pod $pod -n $namespace -o jsonpath="{.status.containerStatuses[?(@.name==\"$container\")].state}" | grep -E "$state" || True)
        if [ -z "$container_status" ]; then # check also init container status
            container_status=$(kubectl get pod $pod -n $namespace -o jsonpath="{.status.initContainerStatuses[?(@.name==\"$container\")].state}" | grep -E "$state" || True)
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
        docker run $keep_containers $max_memory $max_cpus --init --cidfile="$tempPrefix-src_cid" -v "$tempdir:/configs" --log-opt max-size="$max_log_size" -a stdout -a stderr --env LOG_LEVEL="$log_level" $src_docker_options "$src_docker_image" read \
          --config "/configs/$src_config_filename" \
          --catalog "/configs/$src_catalog_filename" \
          --state "/configs/$src_state_filename"
    fi
}

function specDst() {
    docker run --rm "$dst_docker_image" spec
}

function sync_local() {
    debug "Writing source output to $output_filepath"
    new_source_state_file="$tempdir/new_state.json"
    readSrc |
        tee >(jq -cR $jq_color_opt --unbuffered 'fromjson? | select(.type != "RECORD" and .type != "STATE")' |
            jq -rR --unbuffered "$jq_src_msg" >&2) |
        jq -cR --unbuffered "fromjson? | select(.type == \"RECORD\" or .type == \"STATE\") | .record.stream |= \"${dst_stream_prefix}\" + ." |
        tee "$output_filepath" |
        docker run $keep_containers $dst_use_host_network $max_memory $max_cpus --cidfile="$tempPrefix-dst_cid" -i --init -v "$tempdir:/configs" --log-opt max-size="$max_log_size" -a stdout -a stderr -a stdin --env LOG_LEVEL="$log_level" $dst_docker_options "$dst_docker_image" write \
        --config "/configs/$dst_config_filename" --catalog "/configs/$dst_catalog_filename" |
        tee >(jq -cR --unbuffered 'fromjson? | select(.type == "STATE") | .state.data' | tail -n 1 > "$new_source_state_file") |
        # https://stedolan.github.io/jq/manual/#Colors
        JQ_COLORS="1;30:0;37:0;37:0;37:0;36:1;37:1;37" \
        jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_dst_msg"
    cp "$new_source_state_file" "$src_state_filepath"
}

function sync_kube() {
    kube_manifest_tmp="$tempdir/connection-pod.yaml"
    pod_name=$(generatePodName)
    local pod=$pod_name
    local namespace=$k8s_namespace
    local src_container=source
    local dst_container=destination
    local state_container=transformer
    local new_state_file=new_state.json
    local wait_for_status="running|completed|terminated"

    generateKubeManifest ${kube_manifest_tmp}
    kubectl apply -f ${kube_manifest_tmp} -n ${namespace}
    # Wait for init container to start up
    waitForPodContainer $namespace $pod init $wait_for_status
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
    touch $tempdir/FINISHED_UPLOADING && kubectl cp $tempdir/FINISHED_UPLOADING $pod:/config/ -n ${namespace} -c init

    # Wait for source container to start up
    waitForPodContainer $namespace $pod $src_container $wait_for_status
    # Tail source logs in the background
    log "Tailing source container logs in the background"
    kubectl logs -f $pod -c $src_container -n ${namespace} | jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_src_msg" &

    waitForPodContainer $namespace $pod $dst_container $wait_for_status
    log "Tailing destination container logs in the background"
    kubectl logs -f $pod -c $dst_container -n ${namespace} | JQ_COLORS="1;30:0;37:0;37:0;37:0;36:1;37:1;37" jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_dst_msg"
    log "Copying $new_state_file from pod $pod"
    kubectl cp $pod:/config/$new_state_file $src_state_filepath -n ${namespace} -c $state_container
    touch $tempdir/FINISHED_DOWNLOADING && kubectl cp $tempdir/FINISHED_DOWNLOADING $pod:/config/ -n ${namespace} -c $state_container
}

function sync() {
    if ((k8s_deployment)); then
        sync_kube
    else
        sync_local
    fi
}

function cleanup() {
    if ((k8s_deployment)); then
        if [[ ! -z "$keep_containers" ]]; then
            log "Deleting pod $pod_name"
            kubectl delete pod $pod_name -n $k8s_namespace
        else
            log "Pod $pod_name is left on the cluster. To delete it, run 'kubectl delete pod $pod_name -n $k8s_namespace'"
        fi
    else
        if [[ -s "$tempPrefix-src_cid" ]]; then
            docker container kill $(cat "$tempPrefix-src_cid") 2>/dev/null || true
            rm "$tempPrefix-src_cid"
        fi
        if [[ -s "$tempPrefix-dst_cid" ]]; then
            docker container kill $(cat "$tempPrefix-dst_cid") 2>/dev/null || true
            rm "$tempPrefix-dst_cid"
        fi
    fi
    rm -rf "$tempdir"
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
    validateRequirements
    setTheme
    validateInput
    tempPrefix="tmp-$(jq -r -n "now")"
    tempPath="$(pwd)/$tempPrefix"
    tempdir=$(mkdir -p $tempPath && echo $tempPath)
    trap cleanup EXIT
    trap cleanup SIGINT
    echo "Created folder $tempdir for temporary Airbyte files"

    if [[ -z ${k8s_deployment+x} ]]; then
        if ((no_src_pull)); then
            log "Skipping pull of source image $src_docker_image"
        else
            log "Pulling source image $src_docker_image"
            docker pull $src_docker_image
        fi
    fi
    writeSrcConfig
    writeSrcCatalog

    checkSrc
    if ((run_src_only)); then
        log "Only running source"
        loadState
        readSrc | jq -cR $jq_color_opt --unbuffered 'fromjson?' | jq -rR "$jq_src_msg"
    else
        if [[ -z ${k8s_deployment+x} ]]; then
            if ((no_dst_pull)); then
                log "Skipping pull of destination image $dst_docker_image"
            else
                log "Pulling destination image $dst_docker_image"
                docker pull $dst_docker_image
            fi
        fi
        parseStreamPrefix
        loadState
        writeDstConfig
        writeDstCatalog
        copyFarosConfig

        log "Running ${GREEN}source [SRC]${NC} and passing output to ${CYAN}destination [DST]${NC}"
        sync
    fi
    log "Done"
}

main "$@"; exit
