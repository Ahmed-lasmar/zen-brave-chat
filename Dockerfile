FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package definition
COPY package.json ./

# Copy server, scripts, tests, and sources
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY tests/ ./tests/
COPY src/ ./src/
COPY manifest.common.json ./

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Health check using built-in http
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

EXPOSE 3000

CMD ["node", "server/index.js"]
