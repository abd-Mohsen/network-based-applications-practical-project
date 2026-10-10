FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
EXPOSE 3002
CMD ["node", "--import", "./tracing.js", "index.js"]
