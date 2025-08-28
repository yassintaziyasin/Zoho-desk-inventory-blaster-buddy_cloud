# Stage 1: Build the frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Setup the backend
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY server/package*.json ./server/
RUN npm install --prefix server
COPY server/ ./server/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/index.js"]