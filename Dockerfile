# syntax=docker/dockerfile:1
# Stage 1: Build do frontend (Vite + React)
FROM node:22-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci
COPY web ./web
RUN npm -w web run build

# Stage 2: Runtime enxuto (Express + @azure-devops/mcp, usuário não-root)
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --omit=dev -w server --include-workspace-root=false && npm cache clean --force

COPY process.config*.json ./
COPY server/src ./server/src
COPY --from=web-build /app/web/dist ./web/dist

USER node
EXPOSE 8080
CMD ["node", "server/src/index.js"]
