# Run tests involving spinning up docker containers

injectApiKey() {
  jq --arg api_key "$FAROS_API_KEY" '
        .dst.config.edition_configs.api_key = $api_key
      ' ./resources/test_config_file_dst_only.json.template > ./resources/test_config_file_dst_only.json
  jq --arg api_key "$FAROS_API_KEY" '
    .src.config.api_key = $api_key |
    .dst.config.edition_configs.api_key = $api_key
  ' ./resources/test_config_file_graph_copy.json.template > ./resources/test_config_file_graph_copy.json
}
BeforeAll 'injectApiKey'

Describe 'Generate config'
  It 'should succeed'
    airbyte_local_test() {
      ./airbyte-local generate-config faros-graphql
    }
    When call airbyte_local_test
    The output should include "Configuration file generated successfully"
    The status should equal 0
  End
  It 'should succeed with static config'
    airbyte_local_test() {
      ./airbyte-local generate-config github
    }
    When call airbyte_local_test
    The output should include "Configuration file generated successfully"
    The status should equal 0
  End
  It 'should succeed with slient option'
    airbyte_local_test() {
      ./airbyte-local generate-config --silent github
    }
    When call airbyte_local_test
    The output should not include "Source Airbyte Configuration Spec"
    The output should include "Configuration file generated successfully"
    The status should equal 0
  End
  It 'should succeed with custom image'
    airbyte_local_test() {
      ./airbyte-local generate-config --image farosai/airbyte-faros-graphql-source
    }
    When call airbyte_local_test
    The output should include "Configuration file generated successfully"
    The status should equal 0
  End
End

Describe 'Check source connection'
  It 'should fail if source connection fails'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-example-source' \
        --src-check-connection \
        --src-only
    }
    When call airbyte_local_test
    The output should include "Failed to validate source connection: User is not chris."
    The status should equal 1
  End
  It 'should fail if source connection fails'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_src_only.json' \
        --src-check-connection \
        --src-only
    }
    When call airbyte_local_test
    The output should include "Source connection is valid."
    The status should equal 0
  End
End

Describe 'Run source sync only'
  It 'should fail if source sync fails auth'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-faros-graphql-source' \
        --src-only
    }
    When call airbyte_local_test
    The stderr should include "Faros API key was not provided"
    The output should include "Failed to discover catalog"
    The status should equal 1
  End
  It 'should succeed with srcOnly'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_src_only.json' \
        --src-only
    }
    When call airbyte_local_test
    The status should equal 0
    The output should include "Source connector completed."
  End
  It 'should succeed with srcOnly and output file'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_src_only.json' \
        --src-output-file 'test_src_output_file'

      grep -q '"uid":"5"' test_src_output_file
    }
    When call airbyte_local_test
    The output should include "Source connector completed."
    The status should equal 0
  End
End

Describe 'Run destination sync'
  It 'should succeed with dstOnly'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_dst_only.json' \
        --dst-only './resources/dockerIt_runDstSync/faros_airbyte_cli_src_output' \
        --debug
    }
    When call airbyte_local_test
    The output should include '[DST] - {"log":{"level":"INFO","message":"Errored 0 records"},"type":"LOG"}'
    The output should include "Destination connector completed."
    The output should include "Airbyte CLI completed."
    The status should equal 0
  End
End

Describe 'Run source and destination sync'
  It 'should succeed with src and dst'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_graph_copy.json'
    }
    When call airbyte_local_test
    The output should include "Source connector completed."

    # default is incremental sync
    The output should include '[SRC] - {"log":{"level":"INFO","message":"Catalog: {\"streams\":[{\"stream\":{\"name\":\"faros_graph\",\"json_schema\":{},\"supported_sync_modes\":[\"full_refresh\",\"incremental\"]},\"sync_mode\":\"incremental\",\"destination_sync_mode\":\"append\"}]}"},"type":"LOG"}'
    The output should include '[DST] - {"log":{"level":"INFO","message":"Catalog: {\"streams\":[{\"stream\":{\"name\":\"myfarosgraphqlsrc__faros_graphql__faros_graph\",\"json_schema\":{},\"supported_sync_modes\":[\"full_refresh\",\"incremental\"]},\"sync_mode\":\"incremental\",\"destination_sync_mode\":\"append\"}]}"},"type":"LOG"}'

    The output should include '[DST] - {"log":{"level":"INFO","message":"Errored 0 records"},"type":"LOG"}'
    The output should include "Destination connector completed."
    The output should include "Airbyte CLI completed."
    The status should equal 0
  End
  It 'should succeed with full refresh'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_graph_copy.json' \
        --full-refresh
    }
    When call airbyte_local_test
    The output should include "Source connector completed."
    
    # catalog should be full refresh
    The output should include '[SRC] - {"log":{"level":"INFO","message":"Catalog: {\"streams\":[{\"stream\":{\"name\":\"faros_graph\",\"json_schema\":{},\"supported_sync_modes\":[\"full_refresh\",\"incremental\"]},\"sync_mode\":\"full_refresh\",\"destination_sync_mode\":\"overwrite\"}]}"},"type":"LOG"}'
    The output should include '[DST] - {"log":{"level":"INFO","message":"Catalog: {\"streams\":[{\"stream\":{\"name\":\"myfarosgraphqlsrc__faros_graphql__faros_graph\",\"json_schema\":{},\"supported_sync_modes\":[\"full_refresh\",\"incremental\"]},\"sync_mode\":\"full_refresh\",\"destination_sync_mode\":\"overwrite\"}]}"},"type":"LOG"}'

    The output should include "Destination connector completed."
    The output should include "Airbyte CLI completed."
    The status should equal 0
  End
End

# Clean up temeporary test files
cleanup() {
  find . -maxdepth 1 -name 'faros_airbyte_cli_config.json' -delete
  find . -maxdepth 1 -name 'test_src_output_file' -delete
  find . -maxdepth 1 -name '*state.json' -delete
  find ./resources/ -name 'test_config_file_dst_only.json' -delete
  find ./resources/ -name 'test_config_file_graph_copy.json' -delete

}
AfterAll 'cleanup'
