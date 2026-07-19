FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Bangkok

RUN apk add --no-cache tzdata

COPY package.json ./
COPY auto_report.js readme.md ./
COPY example ./example

RUN mkdir -p members .locks .state tokens && chown -R node:node /app

USER node

CMD ["npm", "run", "watch"]
