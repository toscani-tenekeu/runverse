# Built from the repo root. By default only the editor is served; the landing page is
# added when built with LANDING=true (RUNVERSE_LANDING=true in .env), as on runverse's own site.
FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

FROM nginx:1.27-alpine
ARG LANDING=false
COPY docker/nginx.conf /tmp/nginx.landing.conf
COPY docker/nginx.editor.conf /tmp/nginx.editor.conf
COPY landing/ /tmp/landing/
RUN if [ "$LANDING" = "true" ]; then \
      mv /tmp/nginx.landing.conf /etc/nginx/conf.d/default.conf && cp -r /tmp/landing/. /usr/share/nginx/html/; \
    else \
      mv /tmp/nginx.editor.conf /etc/nginx/conf.d/default.conf && rm -f /usr/share/nginx/html/*.html; \
    fi && rm -rf /tmp/landing /tmp/nginx.*.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/app/
