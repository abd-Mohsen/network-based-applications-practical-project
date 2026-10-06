FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
