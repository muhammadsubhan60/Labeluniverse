FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# Copy everything (respects .dockerignore)
COPY . .

# Server dependencies (production only)
RUN npm install --omit=dev

# Client dependencies + build
RUN cd client && npm install
RUN cd client && npm run build

EXPOSE 5001

CMD ["node", "server/index.js"]
