const http = require('http');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // 用于验证GitHub Webhook（可选，提升安全）

// 配置1：核心3项（仅服务器配置）
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/zwy2673976185-design/yyszx/main/test-content.html'; // GitHub测试文件Raw地址
const PORT = 3000; // Render服务器端口（需公开）
const GITHUB_WEBHOOK_SECRET = 'your-custom-secret'; // 自定义密钥（后面GitHub配置要填一样的，可选，不填则注释验证逻辑）

// 配置2：要监听的GitHub分支（只在main分支上传文件才触发，可改）
const TARGET_BRANCH = 'main';

// 核心：只存1个最新文件内容（更新时覆盖）
let latestFileContent = '';

// 1. 初始化：首次启动拉1次最新文件（之后只靠上传触发更新）
async function initGitHubFile() {
  try {
    const res = await fetch(GITHUB_RAW_URL);
    latestFileContent = await res.text();
    console.log('初始化完成：服务器保存最新文件（仅1个）');
  } catch (err) {
    console.error('初始化拉取失败：', err);
    latestFileContent = '<h3>文件加载中，稍等重试</h3>';
  }
}
initGitHubFile();

// 2. 核心：处理GitHub Webhook（仅上传文件到目标分支时触发）
function handleGitHubWebhook(req, res) {
  let body = '';
  // 接收GitHub发送的通知数据
  req.on('data', chunk => body += chunk.toString());

  req.on('end', async () => {
    // 可选：验证是否是GitHub发来的通知（避免恶意请求，需和GitHub配置的secret一致）
    const signature = req.headers['x-hub-signature-256'];
    const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
    const digest = `sha256=${hmac.update(body).digest('hex')}`;
    if (signature !== digest) {
      res.writeHead(403);
      res.end('Webhook验证失败（密钥不匹配）');
      return;
    }

    // 解析GitHub通知：确认是“上传文件（push）”且在目标分支
    const payload = JSON.parse(body);
    if (payload.ref === `refs/heads/${TARGET_BRANCH}` && payload.commits) {
      console.log('检测到：上传文件到目标分支，开始更新');
      // 拉取GitHub最新文件，覆盖服务器存储
      const res = await fetch(GITHUB_RAW_URL);
      const newContent = await res.text();
      latestFileContent = newContent; // 只存最新1个

      // 推更新通知给所有前端
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send('need_update'); // 给前端发“更新信号”
        }
      });
      res.writeHead(200);
      res.end('已接收上传通知，服务器更新并推送前端');
    } else {
      // 不是目标分支的上传，忽略
      res.writeHead(200);
      res.end('非目标分支上传，忽略');
    }
  });
}

// 3. HTTP服务器：托管前端 + 接收GitHub Webhook + 提供最新内容接口
const server = http.createServer((req, res) => {
  // 接口1：GitHub Webhook专用（接收上传通知，路径固定为/webhook）
  if (req.url === '/webhook' && req.method === 'POST') {
    handleGitHubWebhook(req, res);
    return;
  }

  // 接口2：前端请求最新内容（只返回服务器存储的最新1个）
  if (req.url === '/get-latest-content' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(latestFileContent);
    return;
  }

  // 接口3：根路径，返回前端悬浮窗页面
  if (req.url === '/' && req.method === 'GET') {
    const frontPath = path.join(__dirname, 'float-main.html');
    fs.readFile(frontPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('前端页面未找到'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end('页面/接口不存在');
});

// 4. WebSocket服务器：给前端推初始化内容 + 上传触发的更新通知
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  console.log('前端连接服务器');
  // 前端刚连接：推最新内容（同时前端存本地，刷新不丢）
  ws.send(JSON.stringify({
    type: 'init_content',
    content: latestFileContent
  }));

  ws.on('close', () => console.log('前端断开连接'));
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`服务器启动！`);
  console.log(`1. 前端访问：https://你的Render服务URL`);
  console.log(`2. GitHub Webhook地址：https://你的Render服务URL/webhook`);
});
