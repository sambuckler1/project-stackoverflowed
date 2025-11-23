# --- runtime-only, JS (no build step) ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# copy source (JS files, not TS)
COPY . .

# Railway injects PORT; default for local
ENV PORT=8080
EXPOSE 8080

# Use your start script (NOT dev)
CMD ["npm", "start"]
