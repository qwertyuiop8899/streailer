FROM node:22-alpine

WORKDIR /app

# Use the audited dependency versions from package-lock.json.
COPY package*.json ./
RUN npm ci --omit=dev

# .dockerignore excludes local secrets, history, fixtures and backups.
COPY . .

EXPOSE 7020
CMD ["node", "index.js"]
