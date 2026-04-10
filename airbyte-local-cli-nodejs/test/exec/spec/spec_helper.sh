# shellcheck shell=sh

# Defining variables and functions here will affect all specfiles.
# Change shell options inside a function may cause different behavior,
# so it is better to set them here.
# set -eu

# This callback function will be invoked only once before loading specfiles.
spec_helper_precheck() {
  # Available functions: info, warn, error, abort, setenv, unsetenv
  # Available variables: VERSION, SHELL_TYPE, SHELL_VERSION
  : minimum_version "0.28.1"
}

# This callback function will be invoked after a specfile has been loaded.
spec_helper_loaded() {
  :
}

# This callback function will be invoked after core modules has been loaded.
spec_helper_configure() {
  # Available functions: import, before_each, after_each, before_all, after_all
  : import 'support/custom_matcher'
}

# Accept stderr that is empty or contains only the known DEP0169 noise from
# Airbyte connector containers (url.parse DeprecationWarning), which we
# cannot suppress from outside the container. Any other stderr content
# causes the matcher to fail so real errors still surface.
ignore_stderr() {
  stderr_content="$1"
  [ -z "$stderr_content" ] && return 0

  unexpected=$(printf '%s' "$stderr_content" | grep -Fv \
    -e 'DEP0169' \
    -e '(Use `node --trace-deprecation ...` to show where the warning was created)' \
    | grep -v '^[[:space:]]*$')

  [ -z "$unexpected" ]
}
