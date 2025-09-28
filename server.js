const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // 若未安装，需在package.json中添加该依赖（版本^2.6.7）

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" } // 允许GitHub Pages跨域连接，适配你的测试场景
});

// 关键配置1：GitHub上测试用HTML文件的Raw地址（替换成你的测试仓库HTML地址）
const GITHUB_TEST_HTML_URL = "https://raw.githubusercontent.com/你的GitHub用户名/测试仓库名/main/测试HTML文件名.html";
// 关键配置2：服务器固定存储路径（仅存1个文件，新文件自动覆盖旧文件）
const SERVER_SAVED_HTML_PATH = path.join(__dirname, "saved-latest-test.html");

// 初始化：服务器启动时，自动拉取GitHub最新测试HTML并存储
async function initLatestTestHtml() {
  try {
    // 1. 从GitHub拉取你上传的最新HTML（适配任意HTML内容，无需修改代码）
    const response = await fetch(GITHUB_TEST_HTML_URL);
    const latestHtml = await response.text();
    // 2. 写入固定路径，覆盖旧文件（确保服务器内永远只有1个最新版）
    fs.writeFileSync(SERVER_SAVED_HTML_PATH, latestHtml);
    console.log("Auto Update服务器：已存储最新测试HTML，旧版本已覆盖");
  } catch (err) {
    console.error("Auto Update服务器：拉取测试HTML失败，错误信息：", err);
  }
}
// 服务器启动时执行初始化操作
initLatestTestHtml();

// 接口：给客户端返回最新测试HTML（直接返回存储的内容，适配任意上传的HTML）
app.get('/get-latest-test-html', (req, res) => {
  if (fs.existsSync(SERVER_SAVED_HTML_PATH)) {
    const htmlContent = fs.readFileSync(SERVER_SAVED_HTML_PATH, 'utf8');
    res.send(htmlContent); // 直接返回HTML内容，客户端可直接渲染
  } else {
    res.send("Auto Update服务器：暂无最新测试内容");
  }
});

// Socket：你上传新HTML后（Render自动重启服务器），向所有在线用户广播更新
io.on('connection', (socket) => {
  console.log("Auto Update服务器：有用户连接");
  // 服务器重启（即你上传新HTML后），给所有连接用户发送“更新指令”
  socket.emit('test-html-updated', { msg: "检测到最新测试HTML，正在自动同步..." });
  socket.on('disconnect', () => {
    console.log("Auto Update服务器：有用户断开连接");
  });
});

// 启动服务器（Render默认端口，无需修改）
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`测试服务器（Auto Update）已启动，运行在端口${PORT}`);
});
