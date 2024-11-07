Describe 'Cli options validation'
  # Option conflict failures
  It 'fails if using both --config-file and --src'
    airbyte_local_test() {
      ls -la
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
        --unknown-option
    }
    When call airbyte_local_test
    The output should include "Unknown option: --unknown-option"
    The status should equal 1
  End
  # It 'should not fail if using --src.* options'
  #   airbyte_local_test() {
  #     ./airbyte-local \
  #       --src.username '<source_username>' 
  #   }
  #   When call airbyte_local_test
  #   The status should equal 0
  # End
  # Missing configuration options
  # Missing src or dst image options
  # Have unknown options
  # It 'fails if missing source image'
  #   airbyte_local_test() {
  #     ./airbyte-local \
  #       --dst 'farosai/dummy-destination-image'
  #   }
  #   When call airbyte_local_test
  #   The output should include "error: required option '--src <image>' not specified"
  #   The status should equal 1
  # End
  # It 'fails if missing destination image'
  #   airbyte_local_test() {
  #     ./airbyte-local \
  #       --src 'farosai/dummy-source-image'
  #   }
  #   When call airbyte_local_test
  #   The output should include "error: required option '--dst <image>' not specified"
  #   The status should equal 1
  # End
  
End