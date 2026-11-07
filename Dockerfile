FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json yarn.lock ./
RUN test "$(yarn --version)" = "1.22.22" && yarn install --frozen-lockfile --production=false && yarn cache clean
COPY sdk ./sdk
COPY services/merchant ./services/merchant
COPY examples/frame ./examples/frame
ENV NODE_ENV=production
ENV FRAME_HOST=0.0.0.0
ENV FRAME_DATABASE=/data/frame.sqlite
EXPOSE 8080
ENV PORT=8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["yarn", "start"]
