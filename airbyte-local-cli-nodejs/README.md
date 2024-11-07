# Airbyte CLI Rewrite

```
nvm use           # Use Node v20
npm run build     # Build src
npm run lint      # Check formatting
npm run bundle    # Bundle typescripts source codes to a single Javascript file
npm run pkg       # Packaging with yao-pkg
npm run test      # Run typescript unit tests

```

## CLI Executable Testing

For shell testing, we use shellspec. Please install shellspec in your terminal to test it locally.

```
brew install shellspec   # Install shellspec on MacOS
npm run shellspec        # Run tests against the Cli executable
```

Note: If you want to add new file to test, please remember to add `_spec.sh` postfix to your filename. Otherwise, shellspec won't pick your tests up.
