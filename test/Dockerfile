FROM shellspec/shellspec:kcov
RUN apk add --no-cache jq docker file
# Create mock kubectl command so script can run with k8s options
RUN touch /usr/local/bin/kubectl
RUN chmod +x /usr/local/bin/kubectl
