const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

// 替换为nrgx仓库中index.html的Raw地址
const GITHUB_HTML_URL = "https://raw.githubusercontent.com/zwy2673976185-design/nrgx/main/index.html";
const SERVER_SAVED_HTML_PATH = path.join(__dirname, "saved-latest-nrgx.html");

async function initLatestHtml() {
  try {
    const response = await fetch(GITHUB_HTML_URL);
    const latestHtml = await response.text();
    fs.writeFileSync(SERVER_SAVED_HTML_PATH, latestHtml);
    console.log("已存储nrgx仓库最新HTML，旧版本已覆盖");
  } catch (err) {
    console.error("拉取nrgx HTML失败：", err);
  }
}
initLatestHtml();

app.get('/get-latest-nrgx-html', (req, res) => {
  if (fs.existsSync(SERVER_SAVED_HTML_PATH)) {
    const htmlContent = fs.readFileSync(SERVER_SAVED_HTML_PATH, 'utf8');
    res.send(htmlContent);
  } else {
    res.send("暂无nrgx最新内容");
  }
});

io.on('connection', (socket) => {
  console.log("有用户连接nrgx测试服务");
  socket.emit('nrgx-html-updated', { msg: "检测到nrgx最新HTML，正在同步..." });
  socket.on('disconnect', () => {
    console.log("用户断开nrgx测试服务连接");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`nrgx测试服务器已启动，运行在端口${PORT}`);
});
