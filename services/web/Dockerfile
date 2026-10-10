FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
EXPOSE 8080
CMD ["node", "--import", "./tracing.js", "server.js"]
