FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "--env-file-if-exists=.env", "server/index.js"]
