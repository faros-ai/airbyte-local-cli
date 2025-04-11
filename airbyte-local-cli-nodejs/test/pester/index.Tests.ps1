# Import the module or script to test if needed
# Import-Module ./airbyte-local.psm1

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

# Clean up temporary test files
AfterAll {
    Get-ChildItem -Path . -Filter 'faros_airbyte_cli_config.json' | Remove-Item -Force
    Get-ChildItem -Path . -Filter 'test_src_output_file' | Remove-Item -Force
    Get-ChildItem -Path . -Filter '*state.json' | Remove-Item -Force
}
