FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Bangkok

RUN apk add --no-cache tzdata

COPY package.json ./
COPY auto_report.js readme.md example.json ./

RUN mkdir -p members .locks tokens && chown -R node:node /app

USER node

CMD ["npm", "run", "watch"]
