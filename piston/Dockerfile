# Piston parses request bodies with body-parser's default 100 KB limit. Raise it so a whole
# workspace (up to MAX_WORKSPACE_MB, 100 MB by default) can be sent to run.
FROM ghcr.io/engineer-man/piston:latest
RUN sed -i "s/body_parser.json()/body_parser.json({ limit: '300mb' })/" /piston_api/src/index.js \
 && grep -q "limit: '300mb'" /piston_api/src/index.js
