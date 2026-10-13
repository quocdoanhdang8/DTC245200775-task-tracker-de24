FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY app/package.json ./
RUN npm install --omit=dev --ignore-scripts \
    && npm cache clean --force
COPY app/src ./src
COPY app/public ./public
COPY db/migrations ./db/migrations

USER 10001:10001
EXPOSE 3000
CMD ["node", "src/server.js"]
