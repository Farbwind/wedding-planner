FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TZ=Europe/Berlin

RUN apk add --no-cache tzdata

WORKDIR /app
COPY package.json ./
# Schriften selbst ausliefern (keine Google-Fonts-Abrufe bei den Gästen)
RUN npm install --omit=dev --no-audit --no-fund \
 && mkdir -p public/fonts \
 && for f in cormorant-garamond hanken-grotesk baloo-2 dm-sans dm-serif-display fraunces pinyon-script playfair-display instrument-serif bricolage-grotesque young-serif caveat; do \
      cp node_modules/@fontsource/$f/files/$f-latin-*.woff2 public/fonts/ ; cp node_modules/@fontsource/$f/files/$f-latin-ext-*.woff2 public/fonts/ 2>/dev/null || true ; \
    done \
 && rm -rf node_modules/@fontsource

COPY *.js ./
COPY public ./public

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
