const express = require('express');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

// 必须改：5处配置，全部换成你的信息
const config = {
  github: {
    secret: '你的GitHub-Webhook密钥', // 1. 自己设一个（比如：my-github-secret-123），后面GitHub要用
    token: '你的GitHub令牌', // 2. 生成的PAT（公开库只要勾“public_repo”权限）
    owner: '你的GitHub用户名', // 3. 比如：zwy2673976185-design
    repo: '你的GitHub仓库名' // 4. 比如：yyszx
  },
  render: {
    domain: '你的Render服务域名' // 5. 部署后从Render复制（和步骤1的域名一致）
  }
};

// 只存最新1个HTML，新上传的覆盖旧的，不用改
let latestHtmlCache = ''; 
let latestHtmlPath = '';  

// 固定配置，不用改
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // 读public文件夹里的index.html，前端页面从这来

// WebSocket服务（给前端推更新，Render上必须这么写，不用改）
const wss = new WebSocket.Server({ noServer: true });
const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  // 前端刚打开时，若有最新HTML，直接推过去
  if (latestHtmlCache) {
    ws.send(JSON.stringify({ type: 'init_latest', content: latestHtmlCache }));
  }
  ws.on('close', () => wsClients.delete(ws));
});

// 核心：接收GitHub的“上传通知”（Webhook回调）
app.post('/github-webhook', (req, res) => {
  // 1. 验证GitHub的通知是不是真的（避免伪造请求，不用改）
  const githubSignature = req.headers['x-hub-signature-256'];
  const hmac = crypto.createHmac('sha256', config.github.secret);
  const localDigest = `sha256=${hmac.update(JSON.stringify(req.body)).digest('hex')}`;
  if (githubSignature !== localDigest) {
    return res.status(403).send('签名错，非法请求');
  }

  // 2. 只处理HTML文件（上传其他文件不触发更新，不用改）
  const addedFiles = req.body?.head_commit?.added || [];
  const targetHtmlFile = addedFiles.find(file => file.endsWith('.html'));
  if (!targetHtmlFile) {
    return res.status(200).send('不是HTML文件，跳过');
  }

  // 3. 从GitHub拉取最新上传的HTML（base64解码，不用改）
  axios.get(`https://api.github.com/repos/${config.github.owner}/${config.github.repo}/contents/${targetHtmlFile}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${config.github.token}` // 用GitHub令牌拉文件
    }
  }).then(githubRes => {
    const htmlContent = Buffer.from(githubRes.data.content, 'base64').toString('utf8');
    
    // 4. 缓存最新HTML（覆盖旧的），并推给所有在线前端
    latestHtmlCache = htmlContent;
    latestHtmlPath = targetHtmlFile;
    wsClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'new_html', content: htmlContent, fileName: targetHtmlFile }));
      }
    });

    res.status(200).send('更新通知已推给前端');
  }).catch(err => {
    console.error('拉GitHub文件失败：', err);
    res.status(500).send('拉文件失败，检查GitHub令牌/仓库名');
  });
});

// 兜底接口：前端本地没缓存时，从这拉最新HTML（不用改）
app.get('/get-latest-html', (req, res) => {
  res.send({
    content: latestHtmlCache,
    fileName: latestHtmlPath,
    updateTime: new Date().toLocaleString()
  });
});

// 启动服务器（Render上固定端口3000，不用改）
const server = app.listen(3000, () => {
  console.log(`前端页面地址：https://${config.render.domain}`);
});

// 处理WebSocket的请求（Render专用，不用改）
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
