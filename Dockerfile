FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS builder
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

ARG VITE_VALHALLA_URL
ARG VITE_CLIENT_ID
ARG VITE_DEFAULT_COSTING_MODEL
ENV VITE_VALHALLA_URL=$VITE_VALHALLA_URL
ENV VITE_CLIENT_ID=$VITE_CLIENT_ID
ENV VITE_DEFAULT_COSTING_MODEL=$VITE_DEFAULT_COSTING_MODEL

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . /app

ENV NODE_ENV=production
RUN npm run build

# production environment
FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de

ARG SOURCE_REVISION
ARG VITE_VALHALLA_URL
ARG VITE_CLIENT_ID
LABEL org.opencontainers.image.source="https://github.com/Intex32/valhalla-web-app"
LABEL org.opencontainers.image.revision="$SOURCE_REVISION"
LABEL dev.heimann.valhalla-url="$VITE_VALHALLA_URL"
LABEL dev.heimann.client-id="$VITE_CLIENT_ID"

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
