const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fetch = require('node-fetch');
const path = require('path');

// 1. 初始化Express和Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" } // 允许所有主页面跨域连接（仅测试用，正式可限制为你的GitHub Pages域名）
});

// 2. 配置：你的外部HTML的GitHub Raw地址（已替换为nrgx仓库）
const EXTERNAL_HTML_URL = "https://raw.githubusercontent.com/zwy2673976185-design/nrgx/main/external-content.html";

// 3. 暴露接口：供主页面拉取最新外部HTML
app.get('/get-latest-external-html', async (req, res) => {
  try {
    const response = await fetch(EXTERNAL_HTML_URL);
    if (!response.ok) throw new Error(`获取外部HTML失败：${response.status}`);
    const htmlContent = await response.text();
    res.send(htmlContent); // 返回最新外部HTML内容
  } catch (err) {
    res.status(500).send(`加载失败：${err.message}`);
  }
});

// 4. Socket.io：服务器部署完成后，通知所有连接的主页面“更新内容”
io.on('connection', (socket) => {
  console.log('有页面连接到服务器');
  
  // 服务器启动/部署完成后，主动推送更新通知
  socket.emit('external-html-updated', { msg: "检测到最新外部HTML，正在同步..." });
  
  socket.on('disconnect', () => {
    console.log('页面断开连接');
  });
});

// 5. 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器已启动，端口：${PORT}`);
  console.log(`外部HTML拉取地址：${EXTERNAL_HTML_URL}`);
});
