# WIP: Airbyte CLI Rewrite

```sh
nvm use           # Use Node v22
npm run build     # Build src
npm run lint      # Check formatting
npm run bundle    # Bundle typescripts source codes to a single Javascript file
npm run pkg       # Packaging with yao-pkg and generate an executable in out/pkg folder
```

## Testing

### Node Js Testing

Please make sure you have a valid DEV Faros api key set in `FARO_API_KEY` environment variable and you have your docker on, otherwise some integration tests would fail.

```sh
# Run typescript unit and integration tests
FARO_API_KEY="<valid_DEV_faros_api_key>" npm test

# or
export FARO_API_KEY="<valid_DEV_faros_api_key>"
npm test

```

### CLI Executable Testing

For shell testing, we use shellspec. Please install shellspec in your terminal to test it locally.
Same as above, you will need to set in `FARO_API_KEY` environment variable and have your docker on.

```sh
# Install shellspec on MacOS
brew install shellspec

# Run tests against the Cli executable
FARO_API_KEY="<valid_DEV_faros_api_key>" npm run shellspec
# or
export FARO_API_KEY="<valid_DEV_faros_api_key>"
npm run shellspec
```

Note: If you want to add new file to test, please remember to add `_spec.sh` postfix to your filename. Otherwise, shellspec won't pick your tests up.
