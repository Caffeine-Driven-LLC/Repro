# Repro's sandbox image: the only place target-repo code and every wrapped scanner ever run
# (CLAUDE.md section 9). Containers from it run with --network none, so everything a scan needs,
# rules included, is baked in at build time.
#
# Build: npm run sandbox:build   (tags repro-sandbox:dev)

ARG GITLEAKS_VERSION=v8.30.1
ARG OSV_SCANNER_VERSION=v2.6.0
ARG SHELLCHECK_VERSION=v0.11.0
ARG HADOLINT_VERSION=v2.15.1
ARG ACTIONLINT_VERSION=1.7.12
ARG TRUFFLEHOG_VERSION=3.99.2
FROM zricethezav/gitleaks:${GITLEAKS_VERSION} AS gitleaks
FROM ghcr.io/google/osv-scanner:${OSV_SCANNER_VERSION} AS osv
FROM koalaman/shellcheck:${SHELLCHECK_VERSION} AS shellcheck
FROM hadolint/hadolint:${HADOLINT_VERSION} AS hadolint
FROM rhysd/actionlint:${ACTIONLINT_VERSION} AS actionlint
FROM trufflesecurity/trufflehog:${TRUFFLEHOG_VERSION} AS trufflehog
FROM node:22-bookworm-slim AS node

# The JS/TS/web linters, installed with the node image's npm and copied over whole. Their configs
# (lint/) are Repro's own and sit next to these node_modules, so the plugins resolve from there.
FROM node AS webtools
ARG ESLINT_VERSION=10.12.0
ARG ESLINT_PLUGIN_SECURITY_VERSION=4.2.0
ARG TYPESCRIPT_ESLINT_VERSION=8.71.1
# 5.9, not 6.x: typescript-eslint supports TypeScript below 6.1, and 6.0 turns `strict` on by
# default, which would type-check a tsconfig that never asked for it more strictly than its own
# project does.
ARG TYPESCRIPT_VERSION=5.9.3
ARG HTMLHINT_VERSION=1.9.2
ARG STYLELINT_VERSION=17.16.0
ARG STYLELINT_CONFIG_RECOMMENDED_VERSION=18.0.0
WORKDIR /opt/repro/lint
RUN echo '{"name":"repro-lint","private":true}' > package.json \
    && npm install --no-audit --no-fund --omit=dev \
         "eslint@${ESLINT_VERSION}" "eslint-plugin-security@${ESLINT_PLUGIN_SECURITY_VERSION}" \
         "@typescript-eslint/parser@${TYPESCRIPT_ESLINT_VERSION}" "typescript@${TYPESCRIPT_VERSION}" \
         "htmlhint@${HTMLHINT_VERSION}" "stylelint@${STYLELINT_VERSION}" \
         "stylelint-config-recommended@${STYLELINT_CONFIG_RECOMMENDED_VERSION}" \
    && rm -rf /root/.npm

# The Python linters, each set in its own virtualenv so none of their pins fight Semgrep's (or each
# other's: Checkov pins half of PyPI). Same base image as the final stage, so the venvs' interpreter
# links still resolve once copied over.
FROM python:3.12-slim-bookworm AS pytools
ARG BANDIT_VERSION=1.9.4
ARG MYPY_VERSION=2.4.0
ARG PYLINT_VERSION=4.1.3
ARG VULTURE_VERSION=2.16
ARG DETECT_SECRETS_VERSION=1.5.0
ARG SQLFLUFF_VERSION=4.4.0
ARG YAMLLINT_VERSION=1.38.0
ARG CODESPELL_VERSION=2.4.3
ARG CHECKOV_VERSION=3.3.27
RUN python3 -m venv /opt/repro/venvs/lint \
    && /opt/repro/venvs/lint/bin/pip install --no-cache-dir \
         "bandit==${BANDIT_VERSION}" "mypy==${MYPY_VERSION}" "pylint==${PYLINT_VERSION}" \
         "vulture==${VULTURE_VERSION}" "detect-secrets==${DETECT_SECRETS_VERSION}" \
         "sqlfluff==${SQLFLUFF_VERSION}" "yamllint==${YAMLLINT_VERSION}" "codespell==${CODESPELL_VERSION}" \
    && python3 -m venv /opt/repro/venvs/checkov \
    && /opt/repro/venvs/checkov/bin/pip install --no-cache-dir "checkov==${CHECKOV_VERSION}" \
    && find /opt/repro/venvs -name __pycache__ -prune -exec rm -rf {} + \
    && rm -rf /opt/repro/venvs/*/lib/python3.12/site-packages/pip

# cppcheck from the official source release. Debian's package would pull in a second Python.
FROM python:3.12-slim-bookworm AS cppcheck
ARG CPPCHECK_VERSION=2.22.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl cmake make g++ \
    && curl -fsSL "https://github.com/danmar/cppcheck/archive/refs/tags/${CPPCHECK_VERSION}.tar.gz" | tar -xz -C /tmp \
    && cmake -S "/tmp/cppcheck-${CPPCHECK_VERSION}" -B /tmp/cppcheck-build -DCMAKE_BUILD_TYPE=Release \
         -DUSE_MATCHCOMPILER=Off -DBUILD_GUI=Off -DBUILD_TESTS=Off -DHAVE_RULES=Off \
         -DFILESDIR=/opt/repro/cppcheck -DCMAKE_INSTALL_PREFIX=/opt/repro/cppcheck \
    && cmake --build /tmp/cppcheck-build -j "$(nproc)" \
    && cmake --install /tmp/cppcheck-build \
    && /opt/repro/cppcheck/bin/cppcheck --version

FROM python:3.12-slim-bookworm

ARG SEMGREP_VERSION=1.176.0
ARG RUFF_VERSION=0.16.9
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir "semgrep==${SEMGREP_VERSION}" "ruff==${RUFF_VERSION}" \
    && git config --system --add safe.directory '*'

COPY --from=gitleaks /usr/bin/gitleaks /usr/local/bin/gitleaks
COPY --from=osv /osv-scanner /usr/local/bin/osv-scanner
RUN osv-scanner --version
# The single-binary scanners, straight from their official images.
COPY --from=shellcheck /bin/shellcheck /usr/local/bin/shellcheck
COPY --from=hadolint /bin/hadolint /usr/local/bin/hadolint
COPY --from=actionlint /usr/local/bin/actionlint /usr/local/bin/actionlint
COPY --from=trufflehog /usr/bin/trufflehog /usr/local/bin/trufflehog
COPY --from=cppcheck /opt/repro/cppcheck /opt/repro/cppcheck
COPY --from=pytools /opt/repro/venvs /opt/repro/venvs
# Node, for running JS/TS target repos' own test commands (Repair/Verify).
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --from=webtools /opt/repro/lint/node_modules /opt/repro/lint/node_modules
# Each linter's own entry point on PATH, never a venv's bin/ directory: that would also put the
# venv's python3 first, and the sandbox's python3 has to stay the one a bare `python3` means.
RUN for t in bandit mypy pylint vulture detect-secrets sqlfluff yamllint codespell; do \
         ln -s "/opt/repro/venvs/lint/bin/$t" "/usr/local/bin/$t"; \
       done \
    && ln -s /opt/repro/venvs/checkov/bin/checkov /usr/local/bin/checkov \
    && ln -s /opt/repro/cppcheck/bin/cppcheck /usr/local/bin/cppcheck \
    && for t in eslint tsc htmlhint stylelint; do \
         ln -s "/opt/repro/lint/node_modules/.bin/$t" "/usr/local/bin/$t"; \
       done \
    && shellcheck --version && hadolint --version && actionlint --version && trufflehog --version \
    && cppcheck --version && eslint --version && tsc --version && checkov --version

# Semgrep registry packs, fetched once at build time (the run-time container has no network).
# p/javascript and p/typescript are merged and deduplicated by rule id into one "registry" pack.
COPY build/prepare-rules.py /opt/repro/build/prepare-rules.py
RUN mkdir -p /tmp/registry \
    && for p in javascript typescript python; do \
         curl -fsSL "https://semgrep.dev/c/p/$p" -o "/tmp/registry/$p.yml"; \
       done \
    && python3 /opt/repro/build/prepare-rules.py /opt/repro/rules registry /tmp/registry/*.yml \
    && rm -rf /tmp/registry

# OSV vulnerability databases for npm and PyPI (the target ecosystems), fetched once at build
# time for osv-scanner's offline mode. This is the snapshot every dependency Finding is judged
# against; its date is recorded next to it and printed in every reproduction. Rebuild the image
# to refresh it. About 250 MB.
ENV OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY=/opt/repro/osv
RUN mkdir -p /tmp/osv-seed \
    && printf '{"name":"seed","lockfileVersion":3,"packages":{"node_modules/lodash":{"version":"4.17.20"}}}' > /tmp/osv-seed/package-lock.json \
    && printf 'requests==2.19.0\n' > /tmp/osv-seed/requirements.txt \
    && (osv-scanner scan source --offline-vulnerabilities --download-offline-databases --format json \
          -L /tmp/osv-seed/package-lock.json -L /tmp/osv-seed/requirements.txt > /dev/null; test $? -le 1) \
    && test -s /opt/repro/osv/osv-scalibr/npm/all.zip \
    && test -s /opt/repro/osv/osv-scalibr/PyPI/all.zip \
    && date -u +%Y-%m-%dT%H:%MZ > /opt/repro/osv/SNAPSHOT \
    && chmod -R a+rX /opt/repro/osv \
    && rm -rf /tmp/osv-seed

COPY rules/privacy-patterns /tmp/privacy-patterns
RUN python3 /opt/repro/build/prepare-rules.py /opt/repro/rules privacy-patterns /tmp/privacy-patterns/*.yml \
    && rm -rf /tmp/privacy-patterns

COPY gitleaks /opt/repro/gitleaks
COPY lint /opt/repro/lint
COPY bin /opt/repro/bin

ENV PATH=/opt/repro/bin:$PATH \
    HOME=/tmp \
    SEMGREP_SEND_METRICS=off \
    SEMGREP_ENABLE_VERSION_CHECK=0 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /workspace
