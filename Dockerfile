# Two stages, and the runtime one carries no build tooling.
#
# Next's `standalone` output traces only the server dependencies actually reached,
# so the runtime image is the app and a node_modules subset rather than everything
# that was needed to compile it.

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Not root. Nothing here needs to be.
RUN addgroup -g 1001 -S nodejs && adduser -S next -u 1001
COPY --from=builder --chown=next:nodejs /app/.next/standalone ./
COPY --from=builder --chown=next:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=next:nodejs /app/public ./public
USER next
EXPOSE 3000
CMD ["node", "server.js"]
