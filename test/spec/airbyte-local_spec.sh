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


