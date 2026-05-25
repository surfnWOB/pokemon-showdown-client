FROM node:20-bookworm-slim AS build

ARG SERVER_HOST=sim.example.com
ARG CLIENT_HOST=play.example.com
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

COPY --from=showdown-server package*.json ./caches/pokemon-showdown/
RUN cd caches/pokemon-showdown && npm ci && cd ../..
COPY --from=showdown-server . ./caches/pokemon-showdown/
RUN cd caches/pokemon-showdown && node build && cd ../..

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
Config.customcolors = {};
Config.bannedHosts = [];
Config.whitelist = [];
EOF

RUN sed -i 's#https://play.pokemonshowdown.com/config/config.js#config/config.js#' play.pokemonshowdown.com/testclient.html
RUN sed -i 's/Config.testclient = true;//' play.pokemonshowdown.com/testclient.html
RUN node build full
RUN find play.pokemonshowdown.com -type l -exec sh -c \
    'target=$(readlink -f "$1") && rm "$1" && cp "$target" "$1"' _ {} \;
RUN echo "// testclient-key stub for self-hosted" > play.pokemonshowdown.com/config/testclient-key.js
RUN echo "Config.routes.client = '${CLIENT_HOST}';" >> play.pokemonshowdown.com/config/config.js
RUN sed -i '/<script src="js\/battledata.js"/a <script>if(window.Dex){Dex.resourcePrefix="https://play.pokemonshowdown.com/";Dex.fxPrefix="https://play.pokemonshowdown.com/fx/";}<\/script>' play.pokemonshowdown.com/testclient.html

FROM nginxinc/nginx-unprivileged:alpine
COPY docker/nginx-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/play.pokemonshowdown.com /usr/share/nginx/html
EXPOSE 8080
