FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG VITE_APP_BASE_PATH=/mehay
ENV VITE_APP_BASE_PATH=${VITE_APP_BASE_PATH}
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim AS neurodvs-mocks
WORKDIR /app
RUN python -m pip install --no-cache-dir fastapi==0.163.1 uvicorn==0.54.0
USER 1000:1000

FROM node:24-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3087 APP_BASE_PATH=/mehay
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev && mkdir /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts/validate-knowledge.mjs ./scripts/validate-knowledge.mjs
USER node
VOLUME ["/app/data"]
EXPOSE 3087
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3087/mehay/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["sh", "-c", "node scripts/validate-knowledge.mjs \"$MEHAY_KB_DIR\" \"$NEURODVS_DATA_PATH\" && exec node server/index.mjs"]
