FROM node:20-alpine

# openssh-client is needed by git for an SSH remote -- without it git sync fails
# with "ssh: not found", reported as a generic "could not read from remote
# repository" that looks like a credentials problem rather than a missing binary.
RUN apk add --no-cache git sqlite openssh-client

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data

EXPOSE 3031

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3031/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
