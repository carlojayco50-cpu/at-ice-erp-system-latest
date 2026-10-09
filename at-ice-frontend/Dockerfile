# Stage 1: build the SPA. VITE_* values are baked into the bundle at build
# time, so they arrive as build args (set them as build variables on the server).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG VITE_PUSHER_APP_KEY
ARG VITE_PUSHER_APP_CLUSTER=ap1
ARG VITE_BACKEND_URL
ENV VITE_PUSHER_APP_KEY=$VITE_PUSHER_APP_KEY \
    VITE_PUSHER_APP_CLUSTER=$VITE_PUSHER_APP_CLUSTER \
    VITE_BACKEND_URL=$VITE_BACKEND_URL
RUN npm run build

# Stage 2: nginx serves the SPA and fronts the Laravel API (FastCGI to backend:9000).
FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
