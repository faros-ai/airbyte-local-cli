Describe 'Cli options validation'
  # Option conflict failures
  It 'fails if using both --config-file and --src'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file 'some_test_path' \
        --src 'farosai/airbyte-servicenow-source'
    }
    When call airbyte_local_test
    The output should include "option '--config-file <path>' cannot be used with option '--src <image>'"
    The status should equal 1
  End
  It 'fails if using both --config-file and --dst'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file 'some_test_path' \
        --dst 'farosai/airbyte-faros-destination'
    }
    When call airbyte_local_test
    The output should include "option '--config-file <path>' cannot be used with option '--dst <image>'"
    The status should equal 1
  End
  It 'fails if using both --config-file and --wizard'
    airbyte_local_test() {
      ./airbyte-local \
        --config-file 'some_test_path' \
        --wizard github
    }
    When call airbyte_local_test
    The output should include "option '--config-file <path>' cannot be used with option '--wizard <src> [dst]'"
    The status should equal 1
  End
  It 'fails if using both --src/--dst and --wizard'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-servicenow-source' \
        --dst 'farosai/airbyte-faros-destination' \
        --wizard github
    }
    When call airbyte_local_test
    The output should include "option '--wizard <src> [dst]' cannot be used with option '--src <image>'"
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
End

Describe 'Validate temporary directory and files creation'
  It 'check docker in shellspec test environment'
    When run docker --version
    The output should include "Docker version"
    The status should equal 0
  End
  Skip 'TODO @FAI-14452 - Run docker tests in CI'
  It 'should fail if provided state file path is invalid'
    airbyte_local_test() {
      ./airbyte-local \
        --src 'farosai/airbyte-servicenow-source' \
        --dst 'farosai/airbyte-faros-destination' \
        --state-file 'invalid_file'
    }
    When call airbyte_local_test
    The output should include "State file 'invalid_file' not found. Please make sure the state file exists and have read access."
    The status should equal 1
  End
End

Describe 'Check source connection'
  Skip 'TODO @FAI-14452 - Run docker tests in CI'
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
End
