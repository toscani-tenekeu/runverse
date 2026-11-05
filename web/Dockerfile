# Built from the repo root so the landing page can be copied in too.
FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY landing/ /usr/share/nginx/html/
COPY --from=build /app/dist/ /usr/share/nginx/html/app/
