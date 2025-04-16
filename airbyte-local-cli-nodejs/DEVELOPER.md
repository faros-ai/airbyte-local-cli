# Airbyte Local CLI

This is the manaual for developers

```sh
nvm use           # Use Node v22
npm run build     # Build src
npm run lint      # Check formatting
npm run bundle    # Bundle typescripts source codes to a single Javascript file
npm run pkg       # Packaging with yao-pkg and generate an executable in out/pkg folder
```

## Testing

### Node Js Testing

Please make sure you have a valid DEV Faros api key set in `FAROS_API_KEY` environment variable and you have your docker running, otherwise some integration tests would fail. All tests are running against DEV so you need to create the api key in dev instead of prod.

```sh
# Run typescript unit and integration tests
FARO_API_KEY="<valid_DEV_faros_api_key>" npm test

# or
export FARO_API_KEY="<valid_DEV_faros_api_key>"
npm test

```

### CLI Executable Testing

It should be easy to run Bash testing locally, while we rely Github action to do Powershell testing.
If you want to add new e2e testing, please make sure you add to both Bash and Powershell if possible.

#### Bash Testing

For Bash shell testing, we use shellspec. Please install shellspec in your terminal to test it locally.
Same as above, you will need to set DEV `FAROS_API_KEY` environment variable and have your docker running.

```sh
# Install shellspec on MacOS
brew install shellspec

# Run tests against the Cli executable
FARO_API_KEY="<valid_DEV_faros_api_key>" npm run shellspec
# or
export FARO_API_KEY="<valid_DEV_faros_api_key>"
npm run shellspec
```

Tests are tagged with 3 different tags `argvParsing`, `main`, `docker`.
This is mostly for testing in different System/Arch in Github CI. We do different level of testing on different System/Arch depending on how the Github runner's capability, e.g. Github Mac runner doesn't have docker installed.

- `argvParsing`: testing arguments parsing.
- `main`: testing the main logic in the CLI that is after checking Docker is installed.
- `docker`: testing anything that will spin up a docker container.

Note: If you want to add new file to test, please remember to add `_spec.sh` postfix to your filename. Otherwise, shellspec won't pick your tests up.

#### Powershell Testing on Windows

We use Pester to run Powershell testing.
It's now enabled on github action and the test are defined in `./tests/pester/index.Tests.ps1`.

Since Github Windows runner ([Windows Server 2022](https://github.com/actions/runner-images/blob/main/images/windows/Windows2022-Readme.md)) only support running Windows images, we pushed 3 testing Windows images for Airbyte connnector.
They are all tagged with `windows-v0.14.11-rc0` as they are based on `v0.14.11`.

- `farosai/airbyte-example-source:windows-v0.14.11-rc0`
- `farosai/airbyte-faros-graphql-source:windows-v0.14.11-rc0`
- `farosai/airbyte-faros-destination:windows-v0.14.11-rc0`

Please note that we do not support running Windows images on Windows in the CLI. We only support Linux images on Windows system. These Windows images are for testing purpose only.
If you want to push or update the images, you can refer to branch [`jg/windows-test-images`](https://github.com/faros-ai/airbyte-connectors/tree/jg/windows-test-images) in repo `faros-ai/airbyte-connectors`. There are Dockerfiles and steps in Github CI to build and push the test images.

## Packaging

We package the NodeJs project to executables by using [yao-pkg](https://github.com/yao-pkg/pkg). We picked it as the popular `pkg` tool from Vercel is archived and `yao-pkg` seems to be the next most maintainable option.
