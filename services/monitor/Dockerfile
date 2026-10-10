FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
EXPOSE 4000
CMD ["node", "index.js"]
