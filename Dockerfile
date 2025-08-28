# Stage 1: Build the React Frontend
# We use a specific Node.js version for consistency and name this stage 'builder'
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies to leverage Docker layer caching
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install

# Copy the rest of the frontend source code
COPY . .

# Build the frontend application, creating a 'dist' folder with static files
RUN npm run build


# Stage 2: Build the Node.js Backend
# This stage prepares the server and its dependencies
FROM node:18-alpine AS server_builder
WORKDIR /app

# Copy server package files and install only production dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --only=production

# Copy the Prisma schema and generate the Prisma Client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the server source code
COPY server ./server/


# Final Stage: Create the Production Image
# This stage assembles the final, optimized image
FROM node:18-alpine
WORKDIR /app

# Set the Node environment to 'production' for performance
ENV NODE_ENV=production

# Copy backend dependencies from the server_builder stage
COPY --from=server_builder /app/server/node_modules ./server/node_modules

# Copy the generated Prisma client from the server_builder stage
COPY --from=server_builder /app/node_modules ./node_modules
COPY --from=server_builder /app/prisma ./prisma/

# Copy the built frontend static files from the 'builder' stage
# The server will be configured to serve these files
COPY --from=builder /app/dist ./public

# Copy the server source code
COPY server ./server/

# Expose the port the server will run on
EXPOSE 3000

# The command to start the server when the container launches
CMD ["node", "server/index.js"]
