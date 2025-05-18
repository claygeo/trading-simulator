FROM node:18-alpine as builder

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Production image
FROM node:18-alpine
WORKDIR /app

# Copy built backend
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package*.json ./
RUN npm ci --only=production

# Copy built frontend
COPY --from=builder /app/frontend/build ./public

EXPOSE 3001
CMD ["node", "dist/server.js"]