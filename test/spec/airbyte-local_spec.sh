Describe 'source and destination image validation'
    It 'fails if missing source image'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --dst 'farosai/dummy-destination-image'
            )
        }
        When call airbyte_local_test
        The output should include "Airbyte source docker image must be set using '--src <image>'"
    End
    It 'fails if missing destination image'
        airbyte_local_test() {
            echo $(
                ../airbyte-local.sh \
                --src 'farosai/dummy-source-image'
            )
        }
        When call airbyte_local_test
        The output should include "Airbyte destination docker image must be set using '--dst <image>'"
    End
End

Describe 'building source config'
    # Makes the docker command a noop since we don't need it for these tests
    docker() {
        true
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
        fi
    }

    It 'uses discovered catalog'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --debug
        The output should include 'Using source configured catalog: {"streams":[{"stream":{"name":"faros_feed","json_schema":{}},"sync_mode":"incremental","destination_sync_mode":"append"}]}'
    End
    It 'full-refresh flag forces full refresh and overwrite mode'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --full-refresh \
                --debug
        The output should include 'Using source configured catalog: {"streams":[{"stream":{"name":"faros_feed","json_schema":{}},"sync_mode":"full_refresh","destination_sync_mode":"overwrite"}]}'
    End
    It 'uses src-catalog-overrides sync mode'
        When run source ../airbyte-local.sh \
                --src 'farosai/dummy-source-image' \
                --src-only \
                --src.feed_cfg.feed_name 'jira-feed' \
                --src.feed_cfg.feed_path 'tms/jira-feed' \
                --src-catalog-overrides '{"faros_feed": {"sync_mode": "full_refresh"}}' \
                --debug
        The output should include 'Using source configured catalog: {"streams":[{"stream":{"name":"faros_feed","json_schema":{}},"sync_mode":"full_refresh","destination_sync_mode":"overwrite"}]}'
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


