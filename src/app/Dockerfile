# app/Dockerfile

# --- build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
# copy Next build output
COPY --from=builder /app/.next ./.next
# (no public/ copy needed)

# Railway provides PORT
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
