FROM node:20-bookworm-slim AS build

ARG SERVER_HOST=sim.example.com
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

RUN cat > config/config.js <<EOF
var Config = Config || {};
Config.version = "0";
Config.defaultserver = {
  id: 'showdown',
  host: '${SERVER_HOST}',
  port: 443,
  httpport: 80,
  altport: 80,
  registered: true
};
EOF

RUN sed -i 's#https://play.pokemonshowdown.com/config/config.js#config/config.js#' play.pokemonshowdown.com/testclient.html
RUN node build full

FROM nginxinc/nginx-unprivileged:alpine
COPY docker/nginx-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/play.pokemonshowdown.com /usr/share/nginx/html
EXPOSE 8080
