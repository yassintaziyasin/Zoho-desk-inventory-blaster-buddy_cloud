# Stage 1: Build the React Frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build


# Stage 2: Prepare Production Node Modules
# This stage installs all dependencies, including dev dependencies needed for Prisma
FROM node:18-alpine AS deps
WORKDIR /app
COPY server/package*.json ./server/package.json
COPY server/package-lock.json ./server/package-lock.json
COPY server/prisma ./server/prisma
RUN cd server && npm install


# Final Stage: Create the Production Image
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy the server's package.json
COPY server/package.json ./server/package.json

# Copy production node_modules and the generated Prisma client from the 'deps' stage
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/server/prisma ./server/prisma

# Copy the built frontend static files from the 'builder' stage
COPY --from=builder /app/dist ./public

# Copy the backend application source code
COPY server ./server

# Expose the port the server runs on
EXPOSE 3000

# The command to start the server
CMD ["node", "server/index.js"]
