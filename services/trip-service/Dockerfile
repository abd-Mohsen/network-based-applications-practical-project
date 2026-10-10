FROM node:20-slim
WORKDIR /app
COPY package.json ./
# node:20-slim (Debian/glibc) rather than node:20-alpine (musl): better-sqlite3's
# official prebuilt binary targets glibc, so it installs as-is here with no
# compilation needed -- avoids both the musl ABI-mismatch crash a prebuilt
# binary can hit on Alpine, and the memory a from-source compile needs.
RUN npm install --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
EXPOSE 3001
CMD ["node", "--import", "./tracing.js", "index.js"]
