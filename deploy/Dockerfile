# 作业小站 · Docker 镜像
#
# 在 homework-board 目录里构建：
#   docker build -f deploy/Dockerfile -t homework-board .
#   docker run -d --name homework-board --restart unless-stopped \
#     -p 5199:5173 -v "$PWD/data:/data" homework-board
#
# 数据放在挂载出来的 /data 里，容器删了也不会丢。

FROM node:20-alpine

WORKDIR /app

# 项目是零依赖的，不需要 npm install，直接拷代码
COPY public/ ./public/
COPY server.js worker.js package.json ./

# 数据写到挂载卷里
ENV NODE_ENV=production \
    PORT=5173 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
VOLUME ["/data"]

# 用非 root 跑；alpine 里自带 node 用户（uid 1000）
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 5173

# 容器健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
