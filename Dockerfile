FROM node:20-slim

WORKDIR /app

# Server dependencies (production only — skip devDeps like nodemon)
COPY package*.json ./
RUN npm install --omit=dev

# Client dependencies (all — devDeps required for CRACO build)
COPY client/package*.json ./client/
RUN cd client && npm install

# Copy all source
COPY . .

# Build React frontend
RUN cd client && npm run build

EXPOSE 5001

CMD ["node", "server/index.js"]
