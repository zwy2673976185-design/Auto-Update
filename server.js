const express = require('express');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

const config = {
  github: {
    secret: 'my-auto-update-secret-2025', // 需与GitHub Webhook的Secret一致
    token: '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', // 你的GitHub个人访问令牌
    owner: 'zwy2673976185-design', // 你的GitHub用户名
    repo: 'Auto-Update' // 你的仓库名
  },
  render: {
    domain: 'auto-update-z5j4.onrender.com' // 你的Render服务域名
  }
};

let latestHtmlCache = '';
let latestHtmlPath = '';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const wss = new WebSocket.Server({ noServer: true });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  if (latestHtmlCache) {
    ws.send(JSON.stringify({ type: 'init_latest', content: latestHtmlCache }));
  }
  ws.on('close', () => wsClients.delete(ws));
});

app.post('/github-webhook', (req, res) => {
  const githubSignature = req.headers['x-hub-signature-256'];
  const hmac = crypto.createHmac('sha256', config.github.secret);
  const localDigest = `sha256=${hmac.update(JSON.stringify(req.body)).digest('hex')}`;
  
  if (githubSignature !== localDigest) {
    return res.status(403).send('签名验证失败');
  }

  const addedFiles = req.body?.head_commit?.added || [];
  const targetHtmlFile = addedFiles.find(file => file.endsWith('.html'));

  if (!targetHtmlFile) {
    return res.status(200).send('无目标HTML文件');
  }

  axios.get(`https://api.github.com/repos/${config.github.owner}/${config.github.repo}/contents/${targetHtmlFile}`, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${config.github.token}`
    }
  }).then(githubRes => {
    const htmlContent = Buffer.from(githubRes.data.content, 'base64').toString('utf8');
    
    latestHtmlCache = htmlContent;
    latestHtmlPath = targetHtmlFile;

    wsClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'new_html', content: htmlContent, fileName: targetHtmlFile }));
      }
    });

    res.status(200).send('更新通知已发送');
  }).catch(err => {
    console.error('拉取文件失败', err);
    res.status(500).send('拉取文件失败');
  });
});

app.get('/get-latest-html', (req, res) => {
  res.send({
    content: latestHtmlCache,
    fileName: latestHtmlPath,
    updateTime: new Date().toLocaleString()
  });
});

const server = app.listen(3000, () => {
  console.log(`前端页面地址：https://${config.render.domain}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
