# 1) Build the Arabic site (/ar/*.html + mirrored stylesheet) from the English pages
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build:ar && rm -rf node_modules

# 2) Static site server for Railway: Caddy serves the HTML/CSS/JS as-is.
# Railway injects $PORT; Caddy listens on it (see Caddyfile).
FROM caddy:2.8.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app /srv
