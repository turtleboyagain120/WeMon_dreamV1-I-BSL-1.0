# syntax=docker/dockerfile:1

FROM node:20.11.0-alpine AS base

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json ./

# Enable corepack pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Only production deps for runtime
RUN pnpm install --prod --frozen-lockfile=false

# Copy source
COPY src ./src
COPY docker-data ./docker-data

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node","src/server.js"]

