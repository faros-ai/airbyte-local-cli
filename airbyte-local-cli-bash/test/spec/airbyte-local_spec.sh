Describe 'source and destination image validation'
    It 'fails if missing source image'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --dst 'farosai/dummy-destination-image'
            )
        }
        When call airbyte_local_test
        The output should include "Airbyte source Docker image must be set using '--src <image>'"
    End
    It 'fails if missing destination image'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --src 'farosai/dummy-source-image'
            )
        }
        When call airbyte_local_test
        The output should include "Airbyte destination Docker image must be set using '--dst <image>'"
    End
End

Describe 'kubernetes options validation'
    It 'fails if --src-only option is provided'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --k8s-deployment \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --debug
            )
        }
        When call airbyte_local_test
        The output should include "Source only run is not supported with kubernetes deployment"
    End
    It 'fails if --dst-only option is provided'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --k8s-deployment \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --dst-only \
                --debug
            )
        }
        When call airbyte_local_test
        The output should include "Destination only run is not supported with kubernetes deployment"
    End
    It 'fails if --check-connection option is provided'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --k8s-deployment \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --check-connection \
                --debug
            )
        }
        When call airbyte_local_test
        The output should include "Check connection option is not supported with kubernetes deployment"
    End
    It 'fails if --src-wizard option is provided'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --k8s-deployment \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --src-wizard \
                --debug
            )
        }
        When call airbyte_local_test
        The output should include "Source wizard is not supported with kubernetes deployment"
    End
    It 'fails if --dst-wizard option is provided'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --k8s-deployment \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --dst-wizard \
                --debug
            )
        }
        When call airbyte_local_test
        The output should include "Destination wizard is not supported with kubernetes deployment"
    End
End

Describe 'building source config'
    # Makes the docker command a noop since we don't need it for these tests
    docker() {
        if [[ $* =~ ^run.*spec ]]; then
            echo '{"spec": {"connectionSpecification":{"properties":{}}}}'
        fi
    }

    It 'flat key/values'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --debug
        The output should include 'Using source config: {"feed_cfg":{"feed_path":"tms/jira-feed","feed_name":"jira-feed"}}'
    End
    It 'merges keys'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg '{"feed_name":"jira-feed"}' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --debug
        The output should include 'Using source config: {"feed_cfg":{"feed_path":"tms/jira-feed","feed_name":"jira-feed"}}'
    End
    It 'merges keys recursively'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.inner_cfg.x '1' \
                --src.feed_cfg.inner_cfg.y '2' \
                --src.feed_cfg.inner_cfg.z '{"a":"3"}' \
                --src.feed_cfg.inner_cfg.z.b '4' \
                --debug
        The output should include 'Using source config: {"feed_cfg":{"inner_cfg":{"y":2,"x":1,"z":{"a":"3","b":4}}}}'
    End
End

Describe 'redacting source config secrets'
    # Mock the docker command that invokes the Airbyte source "spec"
    docker() {
        if [[ $* =~ ^run.*spec ]]; then
            echo '
            {
                "spec": {
                    "connectionSpecification": {
                        "properties": {
                            "anyOfObj": {
                                "anyOf": [
                                    {"properties":{"e":{"airbyte_secret": true},"f":{}}},
                                    {"properties":{"g":{"airbyte_secret": true},"h":{}}}
                                ]
                            },
                            "nestedObj": {
                                "type": "object",
                                "properties": {
                                    "other": {},
                                    "secret": {
                                        "airbyte_secret": true
                                    }
                                }
                            },
                            "oneOfObj": {
                                "oneOf": [
                                    {"properties":{"a":{"airbyte_secret": true},"b":{}}},
                                    {"properties":{"c":{"airbyte_secret": true},"d":{}}}
                                ]
                            },
                            "other": {},
                            "secret": {
                                "airbyte_secret": true
                            }
                        }
                    }
                }
            }'
        fi
    }

    It 'redacts airbyte_secret fields'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --src-config-json '{"nestedObj":{"secret":"SHOULD_BE_REDACTED!!!","other":"bar"},"anyOfObj":{"e":"SHOULD_BE_REDACTED!!!","f":"f"},"secret":"SHOULD_BE_REDACTED!!!","oneOfObj":{"a":"SHOULD_BE_REDACTED!!!","b":"b"},"other":"foo"}' \
                --dst-config-json '{"nestedObj":{"secret":"SHOULD_BE_REDACTED!!!","other":"bar"},"anyOfObj":{"g":"SHOULD_BE_REDACTED!!!","h":"h"},"secret":"SHOULD_BE_REDACTED!!!","oneOfObj":{"c":"SHOULD_BE_REDACTED!!!","d":"d"},"other":"foo"}' \
                --debug
        The output should include 'Using source config: {"nestedObj":{"secret":"REDACTED","other":"bar"},"anyOfObj":{"e":"REDACTED","f":"f"},"secret":"REDACTED","oneOfObj":{"a":"REDACTED","b":"b"},"other":"foo"}' 
        The output should include 'Using destination config: {"nestedObj":{"secret":"REDACTED","other":"bar"},"anyOfObj":{"g":"REDACTED","h":"h"},"secret":"REDACTED","oneOfObj":{"c":"REDACTED","d":"d"},"other":"foo"}'
    End
End

Describe 'writing source output'
    # Makes the docker command a noop since we don't need it for these tests
    docker() {
        if [[ $* =~ ^run.*spec ]]; then
            echo '{"spec": {"connectionSpecification":{"properties":{}}}}'
        fi
    }

    It 'writes source output to file'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --src-output-file '/tmp/out.txt' \
                --debug
        The output should include 'Writing source output to /tmp/out.txt'
    End
End

Describe 'building source catalog'
    # Mock the docker command that invokes the Airbyte source "discover"
    docker() {
        if [[ $* =~ ^run.*discover ]]; then
            echo '
            {
                "catalog": {
                    "streams": [
                    {
                        "name": "faros_feed",
                        "json_schema": {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "type": "object",
                        "properties": {
                            "message": {
                            "type": "string"
                            }
                        }
                        },
                        "supported_sync_modes": [
                        "full_refresh",
                        "incremental"
                        ],
                        "source_defined_cursor": true,
                        "default_cursor_field": []
                    }
                    ]
                },
                "type": "CATALOG"
            }'
        elif [[ $* =~ ^run.*spec ]]; then
            echo '{"spec":{"connectionSpecification":{"properties":{}}}}'
        fi
    }

    It 'uses discovered catalog'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --debug
        The output should include 'Using source configured catalog: {"streams":[{"stream":{"name":"faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End
    It 'full-refresh flag forces full refresh and overwrite mode'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --full-refresh \
                --debug
        The output should include 'Using source configured catalog: {"streams":[{"stream":{"name":"faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"full_refresh","destination_sync_mode":"overwrite"}]}'
    End
    It 'uses src-catalog-overrides sync mode'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --src-catalog-overrides '{"faros_feed": {"sync_mode": "full_refresh"}}' \
                --debug
        The output should include 'Using source configured catalog: {"streams":[{"stream":{"name":"faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"full_refresh","destination_sync_mode":"overwrite"}]}'
    End
    It 'ignores disabled streams'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --src-catalog-overrides '{"faros_feed": {"disabled": true}}' \
                --debug
        The output should include 'Using source configured catalog: {"streams":[]}'
    End
End

Describe 'check source'
    It 'check successful'
        # Mock the docker command that invokes the Airbyte source "check"
        docker() {
            if [[ $* =~ ^run.*check ]]; then
                echo '
                {"connectionStatus":{"status":"SUCCEEDED"},"type":"CONNECTION_STATUS"}'
            fi
        }

        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --check-connection

        The output should include 'Connection validation successful'
    End
    It 'check failed'
        # Mock the docker command that invokes the Airbyte source "check"
        docker() {
            if [[ $* =~ ^run.*check ]]; then
                echo '
                {"connectionStatus":{"status":"FAILED", "message":"Something went wrong"},"type":"CONNECTION_STATUS"}'
            fi
        }

        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --check-connection

        The output should include 'Something went wrong'
        The status should be failure
    End
End

Describe 'building destination config'
    # Makes the docker command a noop since we don't need it for these tests
    docker() {
        if [[ $* =~ ^run.*spec ]]; then
            echo '{"spec": {"connectionSpecification":{"properties":{}}}}'
        fi
    }

    It 'merges keys recursively'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --dst.feed_cfg.inner_cfg.x '1' \
                --dst.feed_cfg.inner_cfg.y '2' \
                --dst.feed_cfg.inner_cfg.z '{"a":"3"}' \
                --dst.feed_cfg.inner_cfg.z.b '4' \
                --debug

        The output should include 'Using destination config: {"feed_cfg":{"inner_cfg":{"y":2,"x":1,"z":{"a":"3","b":4}}}}'
    End
    It 'adds Faros SaaS specific config specified via dst.* flags'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/airbyte-faros-destination' \
                --dst.edition_configs '{"edition":"cloud","api_url":"http://faros","api_key":"XYZ","graph":"g1","cloud_graphql_batch_size":10}' \
                --dst.edition_configs.check_connection 'true' \
                --dst-stream-prefix 'dummy_prefix' \
                --debug

        The output should include 'Using destination config: {"edition_configs":{"edition":"cloud","api_url":"http://faros","api_key":"XYZ","graph":"g1","cloud_graphql_batch_size":10,"check_connection":true}}'
    End
End

Describe 'building destination catalog'
    # Mock the docker command that invokes the Airbyte source "discover"
    docker() {
        if [[ $* =~ ^run.*discover ]]; then
            echo '
            {
                "catalog": {
                    "streams": [
                    {
                        "name": "faros_feed",
                        "json_schema": {
                        "$schema": "http://json-schema.org/draft-07/schema#",
                        "type": "object",
                        "properties": {
                            "message": {
                            "type": "string"
                            }
                        }
                        },
                        "supported_sync_modes": [
                        "full_refresh",
                        "incremental"
                        ],
                        "source_defined_cursor": true,
                        "default_cursor_field": []
                    }
                    ]
                },
                "type": "CATALOG"
            }'
        elif [[ $* =~ ^run.*spec ]]; then
            echo '{"spec":{"connectionSpecification":{"properties":{}}}}'
        fi
    }

    It 'uses source catalog with prefixed stream name'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --dst-stream-prefix 'dummy_prefix__' \
                --debug

        The output should include 'Using destination configured catalog: {"streams":[{"stream":{"name":"dummy_prefix__faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End

    It 'creates stream prefix when source and destination are Faros connectors'
        When run source ../airbyte-local.sh \
                --src 'farosai/airbyte-dummy-source-image' \
                --dst 'farosai/airbyte-faros-destination' \
                --debug

        The output should include 'Using destination configured catalog: {"streams":[{"stream":{"name":"mydummysourcesrc__dummy_source__faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End
    It 'creates stream prefix when source and destination are Faros connectors and source image tag has hyphen'
        When run source ../airbyte-local.sh \
                --src 'farosai/airbyte-dummy-source-image:custom-tag' \
                --dst 'farosai/airbyte-faros-destination' \
                --debug

        The output should include 'Using destination configured catalog: {"streams":[{"stream":{"name":"mydummysourcesrc__dummy_source__faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End
    It 'creates stream prefix including connection_name when source and destination are Faros connectors'
        When run source ../airbyte-local.sh \
                --src 'farosai/airbyte-dummy-source-image' \
                --dst 'farosai/airbyte-faros-destination' \
                --connection-name 'connectionXYZ' \
                --debug

        The output should include 'Using destination configured catalog: {"streams":[{"stream":{"name":"connectionXYZ__dummy_source__faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End
    It 'creates stream prefix including connection_name when source and destination are Faros connectors and source image tag has hyphen'
        When run source ../airbyte-local.sh \
                --src 'farosai/airbyte-dummy-source-image:custom-tag' \
                --dst 'farosai/airbyte-faros-destination' \
                --connection-name 'connectionXYZ' \
                --debug

        The output should include 'Using destination configured catalog: {"streams":[{"stream":{"name":"connectionXYZ__dummy_source__faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End
    It 'fails if missing stream prefix when using Faros destination and non-Faros source'
        When run source ../airbyte-local.sh \
                --src 'airbytehq/airbyte-dummy-source-image' \
                --dst 'farosai/airbyte-faros-destination' \
                --debug

        The output should include "farosai/airbyte-faros-destination requires a destination stream prefix. Specify this by adding '--dst-stream-prefix <value>'"
        The status should be failure
    End
    It 'allows missing stream prefix when using non-Faros source and destination'
        When run source ../airbyte-local.sh \
                --src 'airbytehq/dummy-source-image' \
                --dst 'airbytehq/dummy-destination-image' \
                --debug

        The output should include 'Using destination configured catalog: {"streams":[{"stream":{"name":"faros_feed","supported_sync_modes":["full_refresh","incremental"],"json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End
End

Describe 'building kubernetes manifest - source image'
    # kubectl call: kubectl apply -f ${kube_manifest_tmp} -n ${namespace}
    kubectl() {
        local manifest=$3
        grep 'image: farosai/dummy-source-image' $manifest
        exit $?
    }

    It 'sets source image'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src.key 'value' \
                --dst 'farosai/dummy-destination-image' \
                --dst.key 'value' \
                --k8s-deployment \
                --keep-containers \
                --debug

        The output should include 'image: farosai/dummy-source-image'
    End
End

Describe 'building kubernetes manifest - destination image'
    # kubectl call: kubectl apply -f ${kube_manifest_tmp} -n ${namespace}
    kubectl() {
        local manifest=$3
        grep 'image: farosai/dummy-destination-image' $manifest
        exit $?
    }

    It 'sets source image'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src.key 'value' \
                --dst 'farosai/dummy-destination-image' \
                --dst.key 'value' \
                --k8s-deployment \
                --keep-containers \
                --debug

        The output should include 'image: farosai/dummy-destination-image'
    End
End

Describe 'building kubernetes manifest - mem limit'
    # kubectl call: kubectl apply -f ${kube_manifest_tmp} -n ${namespace}
    kubectl() {
        local manifest=$3
        grep 'memory: "700Mi"' $manifest
        exit $?
    }

    It 'sets container memory limit'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src.key 'value' \
                --dst 'farosai/dummy-destination-image' \
                --dst.key 'value' \
                --k8s-deployment \
                --max-mem 700Mi \
                --keep-containers \
                --debug

        The output should include '          memory: "700Mi"'
    End
End

Describe 'building kubernetes manifest - cpu limit'
    # kubectl call: kubectl apply -f ${kube_manifest_tmp} -n ${namespace}
    kubectl() {
        local manifest=$3
        grep 'cpu: "700m"' $manifest
        exit $?
    }

    It 'sets container cpu limit'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src.key 'value' \
                --dst 'farosai/dummy-destination-image' \
                --dst.key 'value' \
                --k8s-deployment \
                --max-cpus 700m \
                --keep-containers \
                --debug

        The output should include '          cpu: "700m"'
    End
End

Describe 'collectStates jq filter'
    # Define the jq filter inline to test without sourcing the main script
    # This must match the collectStates function in airbyte-local.sh
    # Note: collectStates now expects pre-filtered JSONL input (only STATE messages)
    collectStates() {
        jq -sc '
            if length == 0 then
                empty
            elif .[0].state.type == "STREAM" then
                group_by(.state.stream.stream_descriptor.name) | map(.[-1].state)
            elif .[0].state.type == "GLOBAL" then
                [.[-1].state]
            else
                .[-1].state.data
            end
        '
    }

    It 'aggregates STREAM states by stream name, keeping the last state per stream'
        test_stream_aggregation() {
            {
                echo '{"type":"STATE","state":{"type":"STREAM","stream":{"stream_descriptor":{"name":"users"},"stream_state":{"format":"base64/gzip","data":"dXNlcnMx"}}}}'
                echo '{"type":"STATE","state":{"type":"STREAM","stream":{"stream_descriptor":{"name":"orders"},"stream_state":{"format":"base64/gzip","data":"b3JkZXJzMQ=="}}}}'
                echo '{"type":"STATE","state":{"type":"STREAM","stream":{"stream_descriptor":{"name":"users"},"stream_state":{"format":"base64/gzip","data":"dXNlcnMy"}}}}'
            } | collectStates
        }
        When call test_stream_aggregation
        The output should equal '[{"type":"STREAM","stream":{"stream_descriptor":{"name":"orders"},"stream_state":{"format":"base64/gzip","data":"b3JkZXJzMQ=="}}},{"type":"STREAM","stream":{"stream_descriptor":{"name":"users"},"stream_state":{"format":"base64/gzip","data":"dXNlcnMy"}}}]'
    End

    It 'returns LEGACY state data only'
        test_legacy_state() {
            echo '{"type":"STATE","state":{"data":{"format":"base64/gzip","data":"dGVzdA=="}}}' | collectStates
        }
        When call test_legacy_state
        The output should equal '{"format":"base64/gzip","data":"dGVzdA=="}'
    End

    It 'returns empty for no STATE messages'
        test_no_state() {
            # collectStates expects pre-filtered input, so empty input means no states
            echo -n '' | collectStates
        }
        When call test_no_state
        The output should equal ''
    End
End
