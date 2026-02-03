FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
# Using npm install instead of ci to ensure it picks up the fixed dotenv version
# and handles any potential lockfile mismatches gracefully
RUN npm install

# Copy source code
COPY . .

# Expose the default port
EXPOSE 7020

# Start the addon
CMD ["node", "index.js"]
