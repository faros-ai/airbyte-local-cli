# WIP: Airbyte CLI Rewrite

```sh
nvm use           # Use Node v20
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

## MacOS Code Signing

Add both the certificate and private key to KeyChain app.
Verify the identity is there by using `security` cli and make sure you see `Developer ID Application: Faros AI, Inc. (2HJ5CL7QY4)` identity.

```sh
security find-identity -p codesigning -v
>  1) *** "Developer ID Application: Faros AI, Inc. (2HJ5CL7QY4)"
     1 valid identities found

```

Code Sign

```sh
# gnerate the executable
npm run pkg

# cd to the same directory as the binary
cd out/pkg

# The package library signed it with `adhoc`
codesign -dvvv airbyte-local
# ... Signature=adhoc

# Optional: Remove signature
codesign --remove-signature ./airbyte-local
codesign -dvvv airbyte-local
# > airbyte-local: code object is not signed at all

codesign --force --verbose --timestamp --options runtime \
  --entitlements entitlements.plist \
  --sign "Developer ID Application: Faros AI, Inc. (2HJ5CL7QY4)" airbyte-local
# codesign --deep --force --verbose --timestamp --sign "Developer ID Application: Faros AI, Inc. (2HJ5CL7QY4)" --options runtime ./airbyte-local
# > (Type your Mac login password in the pop up)
# > ./airbyte-local: signed Mach-O thin (arm64) [airbyte-local]

codesign -dvvv airbyte-local
# > Executable=/Users/jenniegao/Documents/airbyte-local-cli/airbyte-local-cli-nodejs/out/pkg/airbyte-local
#   Identifier=airbyte-local
#   Format=Mach-O thin (arm64)
#   CodeDirectory v=20400 size=373969 flags=0x0(none) hashes=11681+2 location=embedded
#   Hash type=sha256 size=32
#   CandidateCDHash sha256=85860a1de2f6870d6b89291f65bbc09554a94909
#   CandidateCDHashFull sha256=85860a1de2f6870d6b89291f65bbc09554a9490967b63e9517f1bc866752dbed
#   Hash choices=sha256
#   CMSDigest=85860a1de2f6870d6b89291f65bbc09554a9490967b63e9517f1bc866752dbed
#   CMSDigestType=2
#   CDHash=85860a1de2f6870d6b89291f65bbc09554a94909
#   Signature size=9047
#   Authority=Developer ID Application: Faros AI, Inc. (2HJ5CL7QY4)
#   Authority=Developer ID Certification Authority
#   Authority=Apple Root CA
#   Timestamp=Mar 19, 2025 at 14:40:43
#   Info.plist=not bound
#   TeamIdentifier=2HJ5CL7QY4
#   Sealed Resources=none
#   Internal requirements count=1 size=176
```

Notarizing (WIP)

```sh
# `jennie@faros.ai` is added as App manager to the business account
xcrun notarytool store-credentials "AppPwdNotarizID" --apple-id "jennie@faros.ai" --team-id "2HJ5CL7QY4" --password "<APP_SPECIFIC_PSWD>"

# submit notary
zip -r airbyte-local.zip airbyte-local
xcrun notarytool submit airbyte-local.zip --keychain-profile "AppPwdNotarizID"

# check notary status
xcrun notarytool info <Submission_ID> --keychain-profile "AppPwdNotarizID"
```
