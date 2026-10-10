FROM node:20-slim
WORKDIR /app
COPY package.json ./
# See trip-service/Dockerfile for why this is Debian/glibc rather than Alpine.
RUN npm install --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
EXPOSE 3003
CMD ["node", "--import", "./tracing.js", "index.js"]
