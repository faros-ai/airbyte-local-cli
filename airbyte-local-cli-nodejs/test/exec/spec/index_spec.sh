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

Describe 'Cli argv validation' 'argvParsing'
  # Option conflict failures
  It 'fails if using both --config-file and --src'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file 'some_test_path' \
        --src 'farosai/airbyte-servicenow-source'
    }
    When call airbyte_local_test
    The output should include "option '-c, --config-file <path>' cannot be used with option '--src <image>'"
    The status should equal 1
  End
  It 'fails if using both --config-file and --dst'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file 'some_test_path' \
        --dst 'farosai/airbyte-faros-destination'
    }
    When call airbyte_local_test
    The output should include "option '-c, --config-file <path>' cannot be used with option '--dst <image>'"
    The status should equal 1
  End
  It 'fails if using both --src-only and --src-output-file'
    airbyte_local_test() {
      ./airbyte-local \
        --src-output-file 'some_test_path' \
        --src-only
    }
    When call airbyte_local_test
    The output should include "option '--src-only' cannot be used with option '--src-output-file <path>'"
    The status should equal 1
  End
  It 'fails if using both --src-only and --dst-only'
    airbyte_local_test() {
      ./airbyte-local \
        --src-only \
        --dst-only 'some_test_path'
    }
    When call airbyte_local_test
    The output should include "option '--dst-only <path>' cannot be used with option '--src-only'"
    The status should equal 1
  End
  It 'fails if using both --src-output-file and --dst-only'
    airbyte_local_test() {
      ./airbyte-local \
        --src-output-file 'some_test_path' \
        --dst-only 'some_test_path'
    }
    When call airbyte_local_test
    The output should include "option '--dst-only <path>' cannot be used with option '--src-output-file <path>'"
    The status should equal 1
  End
  It 'fails if using both --src-check-connetion and --dst-only'
    airbyte_local_test() {
      ./airbyte-local \
        --src-check-connection \
        --dst-only 'some_test_path'
    }
    When call airbyte_local_test
    The output should include "option '--dst-only <path>' cannot be used with option '--src-check-connection'"
    The status should equal 1
  End

  # Check for generate-config arguments
  It 'fails if generate-config has not source input'
    airbyte_local_test() {
      ./airbyte-local generate-config
    }
    When call airbyte_local_test
    The output should include "missing required argument 'source'"
    The status should equal 1
  End

  # Check for unknown options
  It 'fails if using unknown options'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-servicenow-source' \
        --dst 'farosai/airbyte-faros-destination' \
        --unknown-option
    }
    When call airbyte_local_test
    The output should include "Unknown option: --unknown-option"
    The status should equal 1
  End
  It 'fails if using unknown options for generate-config'
    airbyte_local_test() {
      ./airbyte-local generate-config --unknown-option foo
    }
    When call airbyte_local_test
    The output should include "unknown option '--unknown-option'"
    The status should equal 1
  End

  # Check for config file
  It 'should fail with invalid json config file'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_invalid'
    }
    When call airbyte_local_test
    The output should include "Failed to read or parse config file"
    The status should equal 1
  End
  It 'should succeed with space in filename'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_src_only space.json'
    }
    When call airbyte_local_test
    The output should include "Reading config file"
    # expected to fail because the config file deosn't include dst
    The status should equal 1
  End
End

Describe 'Validate temporary directory and files creation' 'main'
  It 'check docker in shellspec test environment'
    When run docker --version
    The output should include "Docker version"
    The status should equal 0
  End
  It 'should create temporary directory'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/foo' \
        --dst 'farosai/bar' \
        --debug
    }
    When call airbyte_local_test
    The output should include "Temporary directory created"
    # both src and dst images are invalid so errors are expected
    The status should equal 1
  End
End

Describe 'Stream prefix' 'main'
  It 'should generate stream prefix'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-foo-source' \
        --dst 'farosai/airbyte-faros-destination-bar' \
        --debug
    }
    When call airbyte_local_test
    The output should include "Using connection name: myfoosrc"
    The output should include "Using destination stream prefix: myfoosrc__foo__"
    # both src and dst images are invalid so errors are expected
    The status should equal 1
  End
  It 'should generate stream prefix with connection name'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-foo-source' \
        --dst 'farosai/airbyte-faros-destination-bar' \
        --connection-name 'jennie-connection' \
        --debug
    }
    When call airbyte_local_test
    The output should include "Using connection name: jennie-connection"
    The output should include "Using destination stream prefix: jennie-connection__foo__"
    The output should include "State file 'jennie-connection__state.json' not found. An empty state file will be created."
    # both src and dst images are invalid so errors are expected
    The status should equal 1
  End
End

Describe 'Load state file' 'main'
  It 'should create state file'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-foo-source' \
        --dst 'farosai/airbyte-faros-destination-bar' \
        --debug
    }
    When call airbyte_local_test
    The output should include "State file 'myfoosrc__state.json' not found. An empty state file will be created."
    # both src and dst images are invalid so errors are expected
    The status should equal 1
  End
  It 'should load state file'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/foo' \
        --dst 'farosai/bar' \
        --state-file './resources/test__state.json'
    }
    When call airbyte_local_test
    The output should include "Using state file: './resources/test__state.json'"
    # both src and dst images are invalid so errors are expected
    The status should equal 1
  End
  It 'should fail if provided state file path is invalid'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/foo' \
        --dst 'farosai/bar' \
        --state-file 'invalid_file'
    }
    When call airbyte_local_test
    The output should include "State file 'invalid_file' not found. Please make sure the state file exists and have read access."
    The status should equal 1
  End
End

Describe 'No image pull' 'main'
  It 'should not pull images'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/foo' \
        --dst 'farosai/bar' \
        --no-src-pull \
        --no-dst-pull
    }
    When call airbyte_local_test
    The output should not include "Pulling docker image"
    The status should equal 1
  End
End

Describe 'Generate config' 'docker'
  It 'fails if generate-config not source found'
    airbyte_local_test() {
      ./airbyte-local generate-config foo
    }
    When call airbyte_local_test
    The output should include "Source type 'foo' not found. Please provide a valid source type."
    The status should equal 1
  End
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

Describe 'Check source connection' 'docker'
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

Describe 'Run source sync only' 'docker'
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

Describe 'Run destination sync' 'docker'
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

Describe 'Run source and destination sync' 'docker'
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

Describe 'Container cleanup' 'docker'
  It 'should cleanup containers after normal completion'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file './resources/test_config_file_src_only.json' \
        --src-only

      # Check no containers left from our source image
      count=$(docker ps -q --filter "ancestor=farosai/airbyte-example-source" | wc -l | tr -d ' ')
      [ "$count" -eq 0 ]
    }
    When call airbyte_local_test
    The output should include "Source connector completed."
    The status should equal 0
  End

  It 'should cleanup containers on SIGTERM'
    airbyte_local_test() {
      # Start CLI in background
      ./airbyte-local \
        --config-file './resources/test_config_file_graph_copy.json' &
      CLI_PID=$!

      # Wait for container to start
      sleep 3

      # Send SIGTERM
      kill -TERM $CLI_PID 2>/dev/null || true

      # Wait for cleanup
      sleep 2

      # Verify no containers running
      count=$(docker ps -q --filter "ancestor=farosai/airbyte-faros-graphql-source" | wc -l | tr -d ' ')
      [ "$count" -eq 0 ]
    }
    When call airbyte_local_test
    The output should include "Cleaning up..."
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
