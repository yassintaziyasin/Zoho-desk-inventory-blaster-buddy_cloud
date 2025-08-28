# Stage 1: Build the React Frontend
# This stage builds the static files for our user interface.
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build


# Stage 2: Prepare the Production Backend
# This stage installs only the necessary production dependencies for the server.
FROM node:18-alpine AS backend
WORKDIR /app
COPY server/package*.json ./
RUN npm install --only=production
COPY server ./
# This step is crucial: it generates the Prisma client needed to talk to the database.
RUN npx prisma generate


# Final Stage: Create the Production Image
# This is the final, small image that will be deployed.
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy dependencies and the generated Prisma client from the 'backend' stage.
COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/prisma ./prisma

# Copy the built frontend static files from the 'builder' stage.
COPY --from=builder /app/dist ./public

# Copy the backend application code from the 'backend' stage.
COPY --from=backend /app ./

# Expose the port the server runs on.
EXPOSE 3000

# The command to start the server.
CMD ["node", "index.js"]
