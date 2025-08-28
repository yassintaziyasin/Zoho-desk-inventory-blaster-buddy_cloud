# Stage 1: Build the frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Create the production image
FROM node:20-alpine
WORKDIR /app

# Copy built frontend from the 'builder' stage
COPY --from=builder /app/dist ./dist

# Copy backend dependencies and install them
COPY server/package*.json ./server/
RUN npm install --prefix server --only=production

# Copy the rest of the backend code
COPY server/ ./server/

# Expose the port the server will run on
EXPOSE 3000

# Start the server
CMD ["node", "server/index.js"]