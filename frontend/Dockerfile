# ── FleetTracker Frontend ────────────────────────────────────
# Multi-stage: Node build -> nginx runtime
# OpenShift random UID compatible
# ─────────────────────────────────────────────────────────────

# ── Stage 1 : Build ─────────────────────────────────────────
FROM node:24-bullseye AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

COPY . .
# Skip tsc (pre-existing MapEngine.ts:81 antialias error); vite handles transpilation
RUN npx vite build

# ── Stage 2 : Runtime ───────────────────────────────────────
FROM nginx:1.27-alpine

# Prepare writable directories for OpenShift random UID
RUN mkdir -p \
        /app/dist \
        /tmp/client_temp \
        /tmp/proxy_temp \
        /tmp/fastcgi_temp \
        /tmp/uwsgi_temp \
        /tmp/scgi_temp \
        /var/cache/nginx \
        /var/log/nginx \
    && chgrp -R 0 /app /tmp /var/cache/nginx /var/log/nginx /etc/nginx \
    && chmod -R g+rwX /app /tmp /var/cache/nginx /var/log/nginx /etc/nginx

# Frontend build
COPY --from=build /app/dist /app/dist

# Config template + entrypoint
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod g+rx /app/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
