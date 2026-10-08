# Frontend do serviço de feeds: build estático com Astro, servido por nginx sem root.
FROM node:22-alpine AS build

WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .

# URL pública usada em canonical, Open Graph, sitemap e robots.txt.
ARG SITE_URL=https://cti.segark.com
ENV SITE_URL=${SITE_URL}

# Build + checagens; depois pré-comprime para o gzip_static do nginx.
RUN npm run build \
    && find dist -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.svg' \
       -o -name '*.xml' -o -name '*.txt' -o -name '*.webmanifest' \) -exec gzip -9 -k {} +

FROM nginxinc/nginx-unprivileged:1.31-alpine

ENV API_UPSTREAM=web:5000 \
    API_RATE_LIMIT=10r/s \
    API_RATE_BURST=40 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER="^(API_UPSTREAM|API_RATE_LIMIT|API_RATE_BURST|NGINX_LOCAL_RESOLVERS)$"

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
