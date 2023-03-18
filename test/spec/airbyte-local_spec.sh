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
                --src-config-json '{"nestedObj":{"secret":"SHOULD_BE_REDACTED!!!","other":"bar"},"anyOfObj":{"g":"SHOULD_BE_REDACTED!!!","h":"h"},"secret":"SHOULD_BE_REDACTED!!!","oneOfObj":{"c":"SHOULD_BE_REDACTED!!!","d":"d"},"other":"foo"}' \
                --dst-config-json '{"nestedObj":{"secret":"SHOULD_BE_REDACTED!!!","other":"bar"},"anyOfObj":{"g":"SHOULD_BE_REDACTED!!!","h":"h"},"secret":"SHOULD_BE_REDACTED!!!","oneOfObj":{"c":"SHOULD_BE_REDACTED!!!","d":"d"},"other":"foo"}' \
                --debug
        The output should include 'Using source config: {"nestedObj":{"secret":"REDACTED","other":"bar"},"anyOfObj":{"g":"REDACTED","h":"h"},"secret":"REDACTED","oneOfObj":{"c":"REDACTED","d":"d"},"other":"foo"}' 
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
    It 'does not write source output'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --dst 'farosai/dummy-destination-image' \
                --debug
        The output should include 'Writing source output to /dev/null'
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
    It 'creates stream prefix including connection_name when source and destination are Faros connectors'
        When run source ../airbyte-local.sh \
                --src 'farosai/airbyte-dummy-source-image' \
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
