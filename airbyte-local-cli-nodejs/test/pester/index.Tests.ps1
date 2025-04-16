# Inject API Key and replace to Windows images before all tests
BeforeAll {
    $EXAMPLE_SOURCE_IMAGE = 'farosai/airbyte-example-source:windows-v0.14.11-rc0'
    $FAROS_GRAPHQL_SOURCE_IMAGE = 'farosai/airbyte-faros-graphql-source:windows-v0.14.11-rc0'
    $FAROS_DST_IMAGE = 'farosai/airbyte-faros-destination:windows-v0.14.11-rc0'

    $FAROS_API_KEY = $env:FAROS_API_KEY
    if (-not $FAROS_API_KEY) {
        throw "FAROS_API_KEY environment variable is not set."
    }

    # create windows directory if not exists
    if (-not (Test-Path './resources/windows')) {
        New-Item -ItemType Directory -Path './resources/windows' | Out-Null
    }

    Write-Host "Creating test config files with API key and Windows images..."
    & jq --arg src_image "$EXAMPLE_SOURCE_IMAGE" `
      '.src.image = $src_image' `
      ./resources/test_config_file_src_only.json > ./resources/windows/test_config_file_src_only.json

    & jq --arg api_key "$FAROS_API_KEY" --arg dst_image "$FAROS_DST_IMAGE" `
      '.dst.config.edition_configs.api_key = $api_key | .dst.image = $dst_image' `
      ./resources/test_config_file_dst_only.json.template > ./resources/windows/test_config_file_dst_only.json

    & jq --arg api_key "$FAROS_API_KEY" --arg src_image "$FAROS_GRAPHQL_SOURCE_IMAGE" --arg dst_image "$FAROS_DST_IMAGE" `
      '.src.config.api_key = $api_key | .dst.config.edition_configs.api_key = $api_key | .src.image = $src_image | .dst.image = $dst_image' `
      ./resources/test_config_file_graph_copy.json.template > ./resources/windows/test_config_file_graph_copy.json    

    Write-Host "Pulling images..."
    & docker pull $EXAMPLE_SOURCE_IMAGE
    & docker pull $FAROS_GRAPHQL_SOURCE_IMAGE
    & docker pull $FAROS_DST_IMAGE
    Write-Host "Images pulled successfully."
}

Describe 'Cli argv validation' {
    # Option conflict failures
    It 'fails if using both --config-file and --src' {
        $result = & ./airbyte-local --config-file 'some_test_path' --src 'farosai/airbyte-servicenow-source'
        $matchingLine = $result | Where-Object { $_ -match "option '-c, --config-file <path>' cannot be used with option '--src <image>'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if using both --config-file and --dst' {
        $result = & ./airbyte-local --config-file 'some_test_path' --dst 'farosai/airbyte-faros-destination'
        $matchingLine = $result | Where-Object { $_ -match "option '-c, --config-file <path>' cannot be used with option '--dst <image>'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if using both --src-only and --src-output-file' {
        $result = & ./airbyte-local --src-output-file 'some_test_path' --src-only
        $matchingLine = $result | Where-Object { $_ -match "option '--src-only' cannot be used with option '--src-output-file <path>'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if using both --src-only and --dst-only' {
        $result = & ./airbyte-local --src-only --dst-only 'some_test_path'
        $matchingLine = $result | Where-Object { $_ -match "option '--dst-only <path>' cannot be used with option '--src-only'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if using both --src-output-file and --dst-only' {
        $result = & ./airbyte-local --src-output-file 'some_test_path' --dst-only 'some_test_path'
        $matchingLine = $result | Where-Object { $_ -match "option '--dst-only <path>' cannot be used with option '--src-output-file <path>'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if using both --src-check-connection and --dst-only' {
        $result = & ./airbyte-local --src-check-connection --dst-only 'some_test_path'
        $matchingLine = $result | Where-Object { $_ -match "option '--dst-only <path>' cannot be used with option '--src-check-connection'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if generate-config has no source input' {
        $result = & ./airbyte-local generate-config 2>&1
        $matchingLine = $result | Where-Object { $_ -match "missing required argument 'source'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if using unknown options' {
        $result = & ./airbyte-local --src 'farosai/airbyte-servicenow-source' --dst 'farosai/airbyte-faros-destination' --unknown-option 2>&1
        $matchingLine = $result | Where-Object { $_ -match "Unknown option: --unknown-option" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'fails if using unknown options for generate-config' {
        $result = & ./airbyte-local generate-config --unknown-option foo 2>&1
        $matchingLine = $result | Where-Object { $_ -match "unknown option '--unknown-option'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }
}

Describe 'Validate temporary directory and files creation' {
    It 'check docker in shellspec test environment' {
        $result = & docker --version
        $matchingLine = $result | Where-Object { $_ -match "Docker version" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }

    It 'should create temporary directory' {
        $result = & ./airbyte-local --src 'farosai/foo' --dst 'farosai/bar' --debug
        $matchingLine = $result | Where-Object { $_ -match "Temporary directory created" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }
}

Describe 'Stream prefix' {
    It 'should generate stream prefix' {
        $result = & ./airbyte-local --src 'farosai/airbyte-foo-source' --dst 'farosai/airbyte-faros-destination-bar' --debug
        $matchingLine = $result | Where-Object { $_ -match "Using connection name: myfoosrc" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Using destination stream prefix: myfoosrc__foo__" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'should generate stream prefix with connection name' {
        $result = & ./airbyte-local --src 'farosai/airbyte-foo-source' --dst 'farosai/airbyte-faros-destination-bar' --connection-name 'jennie-connection' --debug
        $matchingLine = $result | Where-Object { $_ -match "Using connection name: jennie-connection" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Using destination stream prefix: jennie-connection__foo__" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "State file 'jennie-connection__state.json' not found. An empty state file will be created." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }
}

Describe 'Load state file' {
    It 'should create state file' {
        $result = & ./airbyte-local --src 'farosai/airbyte-foo-source' --dst 'farosai/airbyte-faros-destination-bar' --debug
        $matchingLine = $result | Where-Object { $_ -match "State file 'myfoosrc__state.json' not found. An empty state file will be created." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'should load state file' {
        $result = & ./airbyte-local --src 'farosai/foo' --dst 'farosai/bar' --state-file './resources/test__state.json'
        $matchingLine = $result | Where-Object { $_ -match "Using state file: './resources/test__state.json'" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'should fail if provided state file path is invalid' {
        $result = & ./airbyte-local --src 'farosai/foo' --dst 'farosai/bar' --state-file 'invalid_file'
        $matchingLine = $result | Where-Object { $_ -match "State file 'invalid_file' not found. Please make sure the state file exists and have read access." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }
}

Describe 'No image pull' {
    It 'should not pull images' {
        $result = & ./airbyte-local --src 'farosai/foo' --dst 'farosai/bar' --no-src-pull --no-dst-pull
        $matchingLine = $result | Where-Object { $_ -notmatch "Pulling docker image" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }
}

Describe 'Generate config' {
    It 'fails if generate-config not source found' {
        $result = & ./airbyte-local generate-config foo
        $matchingLine = $result | Where-Object { $_ -match "Source type 'foo' not found. Please provide a valid source type." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    # This test is skipped because the CLI doesn't support running Windows containers in subcommand `generate-config`
    It 'should succeed' -Skip {
        $result = & ./airbyte-local generate-config faros-graphql
        $matchingLine = $result | Where-Object { $_ -match "Configuration file generated successfully" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }

  # This test is skipped because the CLI doesn't support running Windows containers in subcommand `generate-config`
    It 'should succeed with static config' -Skip {
        $result = & ./airbyte-local generate-config github
        $matchingLine = $result | Where-Object { $_ -match "Configuration file generated successfully" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }

    # This test is skipped because the CLI doesn't support running Windows containers in subcommand `generate-config`
    It 'should succeed with silent option' -Skip {
        $result = & ./airbyte-local generate-config --silent github
        $matchingLine = $result | Where-Object { $_ -notmatch "Source Airbyte Configuration Spec" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Configuration file generated successfully" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }

    # This test is skipped because the CLI doesn't support running Windows containers in subcommand `generate-config`
    It 'should succeed with custom image' -Skip {
        $result = & ./airbyte-local generate-config --image farosai/airbyte-faros-graphql-source
        $matchingLine = $result | Where-Object { $_ -match "Configuration file generated successfully" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }
}

Describe 'Check source connection' {
    It 'should fail if source connection fails' {
        $result = & ./airbyte-local --src "$EXAMPLE_SOURCE_IMAGE" --src-check-connection --src-only
        $matchingLine = $result | Where-Object { $_ -match "Failed to validate source connection: User is not chris." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'should succeed if source connection is valid' {
        $result = & ./airbyte-local --config-file './resources/windows/test_config_file_src_only.json' --src-check-connection --src-only
        $matchingLine = $result | Where-Object { $_ -match "Source connection is valid." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }
}

Describe 'Run source sync only' {
    It 'should fail if source sync fails auth' {
        $result = & ./airbyte-local --src $FAROS_GRAPHQL_SOURCE_IMAGE --src-only 2>&1
        $stderrLine = $result | Where-Object { $_ -match "Faros API key was not provided" }
        $stderrLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Failed to discover catalog" }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 1
    }

    It 'should succeed with srcOnly' {
        $result = & ./airbyte-local --config-file './resources/windows/test_config_file_src_only.json' --src-only 2>&1
        $matchingLine = $result | Where-Object { $_ -match "Source connector completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }

    It 'should succeed with srcOnly and output file' {
        $result = & ./airbyte-local --config-file './resources/windows/test_config_file_src_only.json' --src-output-file 'test_src_output_file' 2>&1
        $matchingLine = $result | Where-Object { $_ -match "Source connector completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        Test-Path 'test_src_output_file' | Should -Be $true
        $LASTEXITCODE | Should -Be 0
    }
}

Describe 'Run destination sync' {
    It 'should succeed with dstOnly' {
        $result = & ./airbyte-local --config-file './resources/windows/test_config_file_dst_only.json' --dst-only './resources/dockerIt_runDstSync/faros_airbyte_cli_src_output' --debug 2>&1
        $matchingLine = $result | Where-Object { $_ -match '\[DST\] - {"log":{"level":"INFO","message":"Errored 0 records"},"type":"LOG"}' }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Destination connector completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Airbyte CLI completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }
}

Describe 'Run source and destination sync' {
    It 'should succeed with src and dst' {
        $result = & ./airbyte-local --config-file './resources/windows/test_config_file_graph_copy.json' 2>&1
        $matchingLine = $result | Where-Object { $_ -match "Source connector completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match '\[SRC\] - {"log":{"level":"INFO","message":"Catalog:.*\\"sync_mode\\":\\"incremental\\",\\"destination_sync_mode\\":\\"append\\"' }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match '\[DST\] - {"log":{"level":"INFO","message":"Catalog:.*\\"sync_mode\\":\\"incremental\\",\\"destination_sync_mode\\":\\"append\\"' }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match '\[DST\] - {"log":{"level":"INFO","message":"Errored 0 records"},"type":"LOG"}' }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Destination connector completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Airbyte CLI completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }

    It 'should succeed with full refresh' {
        $result = & ./airbyte-local --config-file './resources/windows/test_config_file_graph_copy.json' --full-refresh 2>&1
        $matchingLine = $result | Where-Object { $_ -match "Source connector completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match '\[SRC\] - {"log":{"level":"INFO","message":"Catalog:.*\\"sync_mode\\":\\"full_refresh\\",\\"destination_sync_mode\\":\\"overwrite\\"' }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match '\[DST\] - {"log":{"level":"INFO","message":"Catalog:.*\\"sync_mode\\":\\"full_refresh\\",\\"destination_sync_mode\\":\\"overwrite\\"' }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Destination connector completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $matchingLine = $result | Where-Object { $_ -match "Airbyte CLI completed." }
        $matchingLine | Should -Not -BeNullOrEmpty
        $LASTEXITCODE | Should -Be 0
    }
}

# Clean up temporary test files
AfterAll {
    Get-ChildItem -Path . -Filter 'faros_airbyte_cli_config.json' | Remove-Item -Force
    Get-ChildItem -Path . -Filter 'test_src_output_file' | Remove-Item -Force
    Get-ChildItem -Path . -Filter '*state.json' | Remove-Item -Force
    Get-ChildItem -Path ./resources -Filter 'test_config_file_dst_only.json' | Remove-Item -Force
    Get-ChildItem -Path ./resources -Filter 'test_config_file_graph_copy.json' | Remove-Item -Force
    if (Test-Path './resources/windows') {
        Remove-Item -Path './resources/windows' -Recurse -Force
    }
}
