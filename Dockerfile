# Multi-stage build: Node build → Caddy serve
# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=""
RUN npm run build

# Stage 2: Serve with Caddy (automatic TLS via Let's Encrypt)
FROM caddy:alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /usr/share/caddy
EXPOSE 80
EXPOSE 443
