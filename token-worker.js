addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// 用于生成默认短链接的随机字符集函数
function generateShortId(length = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 安全入口路径
  const tokenPath = globalThis.TOKEN ? `/${globalThis.TOKEN}` : '';
  const homePath = tokenPath || '/';
  const savePath = `${tokenPath}/save`;
  const readPath = `${tokenPath}/read`;
  const clearPath = `${tokenPath}/clear`;
  const manifestPath = `${tokenPath}/manifest.json`;

  const isShareRoute = path.startsWith('/share/');

  // 主页
  if (path === homePath) {
    const injectedHTML = htmlTemplate
      .replace(
        '</body>',
        `<script>
          const savePath = "${savePath}";
          const readPath = "${readPath}";
          const clearPath = "${clearPath}";
        </script></body>`
      )
      .replace('__MANIFEST_PATH__', manifestPath);
    return new Response(injectedHTML, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });

  // 保存剪贴板内容
  } else if (path === savePath && request.method === 'POST') {
    try {
      const body = await request.json();
      const content = body.content;
      const maxReads = Number(body.maxReads || 0);
      let customPath = body.customPath ? body.customPath.trim() : '';

      if (!content) return new Response('empty', { status: 400 });

      const isShare = body.isShare;
      let storageKey = "clipboard";

      if (isShare) {
        // 如果填了自定义路径，过滤掉特殊字符；没填则自动生成
        if (customPath) {
          customPath = customPath.replace(/[^a-zA-Z0-9_-]/g, '');
          // 规避系统保留关键词
          if (['save', 'read', 'clear', 'manifest.json'].includes(customPath)) {
            return new Response(JSON.stringify({ status: 'failed', message: '不允许使用系统保留词作为自定义路径' }), { status: 400 });
          }
          storageKey = `share_${customPath}`;
        } else {
          storageKey = `share_${generateShortId(4)}`;
        }
      }

      let KVexpireTime = {};

// 👉 普通剪贴板仍然可以过期（保留原逻辑）
let expireTime = Number(globalThis.EXPIRE ?? 300);

// 👉 分享内容：永久有效（不设置 TTL）
if (!isShare) {
  if (expireTime !== 0) {
    KVexpireTime.expirationTtl = expireTime < 60 ? 60 : expireTime;
  }
}

      const dataToStore = {
        text: content,
        remainingReads: maxReads > 0 ? maxReads : null 
      };

      await KV.put(storageKey, JSON.stringify(dataToStore), KVexpireTime);
      
      return new Response(JSON.stringify({ status: 'saved', key: storageKey.replace('share_', '') }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response('failed', { status: 500 });
    }

  // 读取剪贴板内容
  } else if (path === readPath && request.method === 'GET') {
    return await handleReadKV("clipboard");

  // 处理分享路由
  } else if (isShareRoute && request.method === 'GET') {
    const shortId = path.replace('/share/', '');
    return await handleReadKV(`share_${shortId}`);

  // 清空剪贴板内容
  } else if (path === clearPath) {
    try {
      await KV.delete('clipboard');
      return new Response('cleared');
    } catch (e) {
      return new Response('failed', { status: 500 });
    }

  // iOS 添加到主屏幕
  } else if (path === manifestPath) {
    const injectedManifest = manifestContent.replace('__HOME_PATH__', homePath);
    return new Response(injectedManifest, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(null, { status: 404 });
}

async function handleReadKV(key) {
  const rawData = await KV.get(key);
  if (!rawData) {
    return new Response('内容不存在或已过期、超过查看次数！', { status: 404 });
  }

  try {
    const parsed = JSON.parse(rawData);
    if (parsed.remainingReads !== null) {
      parsed.remainingReads -= 1;
      if (parsed.remainingReads <= 0) {
        await KV.delete(key);
      } else {
        let expireTime = Number(globalThis.EXPIRE ?? 300);
        let KVexpireTime = expireTime !== 0 ? { expirationTtl: expireTime < 60 ? 60 : expireTime } : {};
        await KV.put(key, JSON.stringify(parsed), KVexpireTime);
      }
    }
    return new Response(parsed.text);
  } catch(e) {
    return new Response(rawData);
  }
}

const manifestContent = `{
  "name": "在线剪贴板",
  "short_name": "在线剪贴板",
  "start_url": "__HOME_PATH__",
  "display": "standalone",
  "background_color": "#f4f4f4",
  "theme_color": "#007bff",
  "icons": [
    {
      "src": "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e2/ac/0a/e2ac0a63-9c11-2fd0-9d59-e5b4b512545f/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/400x400ia-75.webp",
      "sizes": "192x192",
      "type": "image/webp"
    }
  ]
}`;

const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <title>在线剪贴板</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e2/ac/0a/e2ac0a63-9c11-2fd0-9d59-e5b4b512545f/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/400x400ia-75.webp">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="apple-touch-icon" href="https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e2/ac/0a/e2ac0a63-9c11-2fd0-9d59-e5b4b512545f/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/400x400ia-75.webp">
  <link rel="manifest" href="__MANIFEST_PATH__">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css">

  <style>
    body {
      font-family: 'Helvetica Neue', 'Arial', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100vh; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); transition: background-color 0.5s ease;
    }
    body.dark-mode { background: linear-gradient(135deg, #333 0%, #222 100%); }
    h1 { color: #2980b9; margin-bottom: 20px; font-size: 2.5em; font-weight: 600; opacity: 0; animation: fadeIn 1s ease-in-out forwards; }
    .dark-mode h1 { color: #74a7d2; }
    .container {
      background-color: rgba(255, 255, 255, 0.85); border-radius: 15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
      padding: 40px; width: 80%; max-width: 500px; transition: background-color 0.5s ease;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%239C92AC' fill-opacity='0.1' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E");
    }
    .dark-mode .container { background-color: rgba(51, 51, 51, 0.85); box-shadow: 0 4px 10px rgba(255, 255, 255, 0.1); }
    textarea {
      width: calc(100% - 30px); height: 180px; margin-bottom: 15px; padding: 15px; border: none; border-radius: 10px;
      font-size: 18px; resize: vertical; color: #333; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1); background-color: #fff;
    }
    .dark-mode textarea { color: #eee; background-color: #444; box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.1); }
    textarea:focus { outline: none; box-shadow: 0 0 5px 2px #2980b9; }
    .dark-mode textarea:focus { box-shadow: 0 0 5px 2px #74a7d2; }
    
    /* 配置区样式 */
    .config-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 14px; color: #555; }
    .dark-mode .config-row { color: #bbb; }
    .config-row div { display: flex; align-items: center; }
    .config-row label { margin-right: 8px; }
    .config-row input { padding: 5px 8px; border: 1px solid #ccc; border-radius: 4px; }
    .dark-mode .config-row input { background-color: #555; color: #fff; border: 1px solid #666; }
    .input-small { width: 50px; text-align: center; }
    .input-medium { width: 140px; }

    .share-result-area {
      display: none; background: rgba(46, 204, 113, 0.15); border: 1px dashed #2ecc71;
      padding: 10px; border-radius: 8px; margin-bottom: 15px; align-items: center; justify-content: space-between;
    }
    .dark-mode .share-result-area { background: rgba(46, 204, 113, 0.1); border-color: #27ae60; }
    .share-url-text {
      font-size: 14px; font-weight: bold; color: #27ae60; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin-right: 10px;
    }
    .dark-mode .share-url-text { color: #2ecc71; }
    .inline-copy-btn {
      background: #2ecc71; color: #fff; border: none; padding: 6px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; white-space: nowrap;
    }
    .inline-copy-btn:hover { background: #27ae60; }

    button {
      background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white; border: 1px solid #2980b9;
      padding: 12px 20px; margin: 5px; border-radius: 8px; cursor: pointer; font-size: 15px; transition: all 0.2s ease-in-out;
      display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    button:hover { background: linear-gradient(135deg, #2980b9 0%, #3498db 100%); transform: scale(1.05); }
    button:active { transform: scale(0.95); box-shadow: none; }
    button i { margin-right: 6px; font-size: 16px; }
    .button-group { display: flex; justify-content: center; flex-wrap: wrap; }

    @media (max-width: 768px) {
      .container { padding: 20px; }
      textarea { height: 160px; font-size: 16px; }
      button { padding: 10px 16px; font-size: 14px; }
      h1 { font-size: 2em; }
      .config-row { flex-direction: column; align-items: flex-start; gap: 8px; }
    }

    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
    ::-webkit-scrollbar-thumb { background: #888; border-radius: 10px; }
    .dark-mode ::-webkit-scrollbar-track { background: #333; }
    .dark-mode ::-webkit-scrollbar-thumb { background: #666; }

    .loading { position: relative; }
    .loading::after {
      content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: 20px; height: 20px; border-radius: 50%; border: 3px solid #fff;
      border-color: #fff transparent #fff transparent; animation: loading 1.2s linear infinite;
    }
    @keyframes loading {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
    @keyframes fadeIn {
      0% { opacity: 0; transform: translateY(-20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>在线剪贴板</h1>
    <textarea id="clipboard" placeholder="在此处粘贴内容..."></textarea>
    
    <div class="config-row">
      <div>
        <label for="maxReadsInput"><i class="fas fa-eye-slash"></i> 次数限制:</label>
        <input type="number" id="maxReadsInput" class="input-small" min="0" value="0" title="0代表不限制">
      </div>
      <div>
        <label for="customPathInput"><i class="fas fa-link"></i> 自定义短链后缀:</label>
        <input type="text" id="customPathInput" class="input-medium" placeholder="选填, 如 mylink">
      </div>
    </div>

    <div class="share-result-area" id="shareResultArea">
      <span class="share-url-text" id="shareUrlText"></span>
      <button class="inline-copy-btn" id="inlineCopyBtn"><i class="fas fa-copy" style="margin-right:3px; font-size:12px;"></i>复制链接</button>
    </div>

    <div class="button-group">
      <button id="saveBtn"><i class="fas fa-cloud-upload-alt"></i>保存</button>
      <button id="readBtn"><i class="fas fa-cloud-download-alt"></i>读取</button>
      <button id="shareBtn" style="background: linear-gradient(135deg, #e67e22 0%, #d35400 100%); border-color: #d35400;"><i class="fas fa-share-alt"></i>生成分享链接</button>
      <button id="copyBtn"><i class="fas fa-copy"></i>复制内容</button>
      <button id="clearBtn"><i class="fas fa-trash-alt"></i>清空</button>
    </div>
  </div>
  <script>
    const clipboardTextarea = document.getElementById('clipboard');
    const saveBtn = document.getElementById('saveBtn');
    const readBtn = document.getElementById('readBtn');
    const shareBtn = document.getElementById('shareBtn');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const maxReadsInput = document.getElementById('maxReadsInput');
    const customPathInput = document.getElementById('customPathInput');
    
    const shareResultArea = document.getElementById('shareResultArea');
    const shareUrlText = document.getElementById('shareUrlText');
    const inlineCopyBtn = document.getElementById('inlineCopyBtn');

    let currentShareUrl = "";

    function checkDarkMode() {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }
    checkDarkMode();
    window.matchMedia('(prefers-color-scheme: dark)').addListener(checkDarkMode);

    function copyToClipboard(text) {
      const tempInput = document.createElement('input');
      tempInput.value = text;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }

    saveBtn.addEventListener('click', async () => {
      const content = clipboardTextarea.value;
      if (content) {
        saveBtn.classList.add('loading');
        const response = await fetch(savePath, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content, maxReads: maxReadsInput.value, isShare: false }) 
        });
        saveBtn.classList.add('loading');
        if (response.ok) {
          alert('已保存到云端主链接！');
        } else {
          alert('保存失败！');
        }
      } else {
        alert('剪贴板为空！');
      }
    });

    // 生成分享链接（支持自定义路径）
    shareBtn.addEventListener('click', async () => {
      const content = clipboardTextarea.value;
      if (content) {
        shareBtn.classList.add('loading');
        const response = await fetch(savePath, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: content, 
            maxReads: maxReadsInput.value, 
            isShare: true,
            customPath: customPathInput.value 
          }) 
        });
        shareBtn.classList.remove('loading');
        
        if (response.ok) {
          const resData = await response.json();
          currentShareUrl = window.location.origin + "/share/" + resData.key;
          
          shareUrlText.textContent = currentShareUrl;
          shareResultArea.style.display = "flex";
          
          copyToClipboard(currentShareUrl);
          alert('链接生成成功，已自动复制到本地剪贴板！');
        } else {
          const errData = await response.json().catch(() => ({}));
          alert(errData.message || '生成分享链接失败！');
        }
      } else {
        alert('请先输入要分享的内容！');
      }
    });

    inlineCopyBtn.addEventListener('click', () => {
      if (currentShareUrl) {
        copyToClipboard(currentShareUrl);
        alert('短链接已复制到剪贴板！');
      }
    });

    readBtn.addEventListener('click', async () => {
      readBtn.classList.add('loading');
      const response = await fetch(readPath);
      readBtn.classList.remove('loading');
      if (response.ok) {
        const content = await response.text();
        clipboardTextarea.value = content;
      } else {
        alert('读取主链接失败、剪贴板为空或已超过查看次数！');
      }
    });

    copyBtn.addEventListener('click', () => {
      const content = clipboardTextarea.value;
      if (content) {
        clipboardTextarea.select();
        document.execCommand('copy');
        alert('内容已复制到本地剪贴板！');
      } else {
        alert('剪贴板为空！');
      }
    });

    clearBtn.addEventListener('click', async () => {
      clearBtn.classList.add('loading');
      const response = await fetch(clearPath);
      clearBtn.classList.remove('loading');
      if (response.ok) {
        clipboardTextarea.value = '';
        shareResultArea.style.display = "none";
        currentShareUrl = "";
        alert('主剪贴板已清空！');
      } else {
        alert('清空失败！');
      }
    });
  </script>
</body>
</html>
`;
