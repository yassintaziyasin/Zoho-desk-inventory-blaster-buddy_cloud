# Stage 1: Build the application
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files from the server directory and install dependencies
COPY server/package.json server/package-lock.json ./
RUN npm install

# Copy the rest of the server source code
COPY server/ ./

# Stage 2: Create the final production image
FROM node:20-slim
WORKDIR /app

# Copy the installed node_modules and source code from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/ ./

# Expose the port the server will run on
EXPOSE 3000

# The command to start the server
CMD ["node", "index.js"]
