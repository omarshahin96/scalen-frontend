# Static site server for Railway: Caddy serves the HTML/CSS/JS as-is.
# Railway injects $PORT; Caddy listens on it (see Caddyfile).
FROM caddy:2.8.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv
# Build files are in the context only for the steps above — don't serve them
RUN rm -f /srv/Caddyfile /srv/Dockerfile /srv/.dockerignore
