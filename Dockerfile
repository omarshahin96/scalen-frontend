# Static site server for Railway: Caddy serves the HTML/CSS/JS as-is.
# Railway injects $PORT; Caddy listens on it (see Caddyfile).
FROM caddy:2.8.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv
