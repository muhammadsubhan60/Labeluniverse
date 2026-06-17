FROM node:20-slim

WORKDIR /app

# Copy everything (respects .dockerignore)
COPY . .

# Server dependencies (production only — --omit=dev is explicit, not NODE_ENV-dependent)
RUN npm install --omit=dev

# Client needs devDependencies (craco, react-scripts) to compile the build
RUN cd client && npm install
RUN cd client && npm run build

# Set production mode for runtime only (after all build steps)
ENV NODE_ENV=production

EXPOSE 5001

CMD ["node", "server/index.js"]
