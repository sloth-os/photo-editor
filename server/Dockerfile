FROM node:24-bookworm-slim
WORKDIR /app
COPY server/index.mjs ./server/index.mjs
COPY src/lib/color.ts ./src/lib/color.ts
COPY package.json ./package.json
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 STILL_COMMUNITY_DB=/data/community.sqlite
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server/index.mjs"]
