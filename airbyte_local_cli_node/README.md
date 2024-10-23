# Spike: Airbyte Cli Rewrite

Packaging with vercel/pkg

```
npm i -g esbuild pkg
npm i
npm run build
npm run vercel-pkg
```

Packaging with yao-pkg

```
nvm use # use node 20
npm uninstall -g pkg

# force to install the latest version
# not sure why the default install version is 5.8.1
# may have to do with i installed pkg before
npm i -g @yao-pkg/pkg@5.16.1
npm run yao-pkg

```

Packaging with node v20/v23 SEA feature

```
# generate a JavaScript file
npm i
npm run build
npm run bundle
# create sea-config.json, create the output folder ./out/sea
# generate the blob to be injected
node --experimental-sea-config sea-config.json

cp $(command -v node) ./out/sea/test-cli
codesign --remove-signature ./out/sea/test-cli
npx postject ./out/sea/test-cli NODE_SEA_BLOB ./out/sea/sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA
codesign --sign - ./out/sea/test-cli

```

Works with really simple commands but shows the experimental warnings.

```
./out/sea/test-cli \
  --src 'farosai/airbyte-servicenow-source' \
  --dst 'farosai/airbyte-faros-destination' \
  --state state.json \
  --check-connection
Options: {
  srcPull: true,
  dstPull: true,
  src: 'farosai/airbyte-servicenow-source',
  dst: 'farosai/airbyte-faros-destination',
  state: 'state.json',
  checkConnection: true
}
(node:23509) ExperimentalWarning: Single executable application is an experimental feature and might change at any time
(Use `test-cli --trace-warnings ...` to show where the warning was created)
```
