# Build từ thư mục gốc repo:  docker build -f server/Dockerfile -t caro .
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev
COPY caro ./caro
COPY server ./server
ENV PORT=8080 DATA_DIR=/data
# Thư mục dữ liệu phải thuộc user node, nếu không máy chủ không ghi được tài khoản.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "server/server.js"]
