FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATA_FILE=/app/data/groups.json \
    APPLICATIONS_FILE=/app/data/applications.json \
    ACTIVITIES_FILE=/app/data/activities.json \
    ACTIVITY_APPLICATIONS_FILE=/app/data/activity-applications.json \
    ACTIVITY_IMAGES_DIR=/app/data/activity-images \
    METRICS_FILE=/app/data/metrics.json

EXPOSE 3001

CMD ["node", "src/index.js"]
