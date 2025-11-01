# --- Build stage: includes devDependencies for TypeScript compilation
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime stage: production-only deps and compiled output
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HTTP_PORT=8080
EXPOSE 8080

# Install only production deps in the runtime image
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS and OpenAPI spec
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi.yaml ./openapi.yaml

CMD ["node", "dist/actions.js"]




