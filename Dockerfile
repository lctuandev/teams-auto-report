FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Bangkok
ENV BROWSER_RENEW_EXECUTABLE_PATH=/usr/bin/chromium
ENV BROWSER_RENEW_HEADLESS=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      fonts-liberation \
      tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY auto_report.js readme.md ./
COPY example ./example

RUN mkdir -p users .locks .state .browser-profiles && chown -R node:node /app

USER node

CMD ["npm", "run", "watch"]
