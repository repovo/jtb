addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

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
    const content = await request.text();
    if (content) {

      // 剪贴板内容过期时间
      let expireTime = Number(globalThis.EXPIRE ?? 300);
      let KVexpireTime = {};
      if (expireTime !== 0) {
        KVexpireTime.expirationTtl = expireTime < 60 ? 60 : expireTime;
      }

      try {
        await KV.put("clipboard", content, KVexpireTime);
        return new Response('saved');
      } catch (e) {
        return new Response('failed', { status: 500 });
      }
    } else {
      return new Response('empty', { status: 400 });
    }

  // 读取剪贴板内容
  } else if (path === readPath && request.method === 'GET') {
    const content = await KV.get("clipboard");
    if (content) {
      return new Response(content);
    } else {
      return new Response(null, { status: 400 });
    }

  // 清空剪贴板内容
  } else if (path === clearPath) {
    try {
      await KV.delete('clipboard');
      return new Response('cleared');
    } catch (e) {
      return new Response('failed', { status: 500 });
    }

  // iOS 添加到主屏幕的相关设置
  } else if (path === manifestPath) {
    const injectedManifest = manifestContent.replace('__HOME_PATH__', homePath);
    return new Response(injectedManifest, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 其他路径返回 404
  return new Response(null, { status: 404 });
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
    },
    {
      "src": "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e2/ac/0a/e2ac0a63-9c11-2fd0-9d59-e5b4b512545f/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/400x400ia-75.webp",
      "sizes": "400x400",
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

  <!-- iOS 添加到主屏幕的相关设置 -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="在线剪贴板">
  <link rel="apple-touch-icon" href="https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/e2/ac/0a/e2ac0a63-9c11-2fd0-9d59-e5b4b512545f/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/400x400ia-75.webp">
  <link rel="manifest" href="__MANIFEST_PATH__">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css">

  <style>
    body {
      font-family: 'Helvetica Neue', 'Arial', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      transition: background-color 0.5s ease;
    }
    body.dark-mode {
      background: linear-gradient(135deg, #333 0%, #222 100%);
    }
    h1 {
      color: #2980b9;
      margin-bottom: 20px;
      font-size: 2.5em;
      font-weight: 600;
      opacity: 0;
      animation: fadeIn 1s ease-in-out forwards;
    }
    .dark-mode h1 {
      color: #74a7d2;
    }
    .container {
      background-color: rgba(255, 255, 255, 0.85);
      border-radius: 15px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
      padding: 40px;
      width: 80%;
      max-width: 500px;
      transition: background-color 0.5s ease;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%239C92AC' fill-opacity='0.1' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E");
    }
    .dark-mode .container {
      background-color: rgba(51, 51, 51, 0.85);
      box-shadow: 0 4px 10px rgba(255, 255, 255, 0.1);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4' viewBox='0 0 4 4'%3E%3Cpath fill='%23CCCCCC' fill-opacity='0.1' d='M1 3h1v1H1V3zm2-2h1v1H3V1z'%3E%3C/path%3E%3C/svg%3E");
    }
    textarea {
      width: calc(100% - 30px);
      height: 250px;
      margin-bottom: 20px;
      padding: 15px;
      border: none;
      border-radius: 10px;
      font-size: 18px;
      resize: vertical;
      color: #333;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
      background-color: #fff;
      overflow: auto;
      transition: box-shadow 0.3s ease; /* 添加过渡效果 */
    }
    .dark-mode textarea {
      color: #eee;
      box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.1);
      background-color: #444;
    }
    textarea:focus {
      outline: none;
      box-shadow: 0 0 5px 2px #2980b9; /* 聚焦时添加更明显的阴影 */
    }
    .dark-mode textarea:focus {
      box-shadow: 0 0 5px 2px #74a7d2; /* 暗黑模式聚焦时添加更明显的阴影 */
    }
    button {
      background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
      color: white;
      border: 1px solid #2980b9; /* 添加细边框 */
      padding: 15px 30px;
      margin: 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 18px;
      transition: all 0.2s ease-in-out; /* 更快的过渡 */
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* 移除悬停时的阴影 */
    }
    button:hover {
      background: linear-gradient(135deg, #2980b9 0%, #3498db 100%);
      transform: scale(1.05); /* 放大效果 */
    }
    button:active {
      transform: scale(0.95); /* 点击时缩小 */
      box-shadow: none;
    }
    button i {
      margin-right: 10px;
      font-size: 20px; /* 增大图标 */
    }
    .button-group {
      display: flex;
      justify-content: center;
    }

    /* 媒体查询：针对小屏幕设备 (例如手机) */
    @media (max-width: 768px) {
      .container {
        padding: 20px;
      }
      textarea {
        height: 200px;
        font-size: 16px;
      }
      button {
        padding: 12px 25px;
        font-size: 16px;
      }
      h1 {
        font-size: 2em;
      }
      .button-group{
        flex-wrap: wrap;
      }
    }

    /* 自定义滚动条 */
    ::-webkit-scrollbar {
      width: 10px;
    }
    ::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 10px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    .dark-mode ::-webkit-scrollbar-track {
      background: #333;
    }
    .dark-mode ::-webkit-scrollbar-thumb {
      background: #666;
    }
    .dark-mode ::-webkit-scrollbar-thumb:hover {
      background: #999;
    }

    /* 加载动画 */
    .loading {
      position: relative;
    }
    .loading::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: 4px solid #fff;
      border-color: #fff transparent #fff transparent;
      animation: loading 1.2s linear infinite;
    }
    @keyframes loading {
      0% {
        transform: translate(-50%, -50%) rotate(0deg);
      }
      100% {
        transform: translate(-50%, -50%) rotate(360deg);
      }
    }
    .dark-mode .loading::after {
      border-color: #eee transparent #eee transparent;
    }

    /* 标题动画 */
    @keyframes fadeIn {
      0% {
        opacity: 0;
        transform: translateY(-20px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>在线剪贴板</h1>
    <textarea id="clipboard" placeholder="在此处粘贴内容..."></textarea>
    <div class="button-group">
      <button id="saveBtn"><i class="fas fa-cloud-upload-alt"></i>保存</button>
      <button id="readBtn"><i class="fas fa-cloud-download-alt"></i>读取</button>
      <button id="copyBtn"><i class="fas fa-copy"></i>复制</button>
      <button id="clearBtn"><i class="fas fa-trash-alt"></i>清空</button>
    </div>
  </div>
  <script>
    const clipboardTextarea = document.getElementById('clipboard');
    const saveBtn = document.getElementById('saveBtn');
    const readBtn = document.getElementById('readBtn');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');

    function checkDarkMode() {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    }
    checkDarkMode();
    window.matchMedia('(prefers-color-scheme: dark)').addListener(checkDarkMode);

    saveBtn.addEventListener('click', async () => {
      const content = clipboardTextarea.value;
      if (content) {
        saveBtn.classList.add('loading');
        const response = await fetch(savePath, { method: 'POST', body: content });
        saveBtn.classList.remove('loading');
        if (response.ok) {
          alert('已保存到云端！');
        } else {
          alert('保存失败！');
        }
      } else {
        alert('剪贴板为空！');
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
        alert('读取失败或剪贴板为空！');
      }
    });

    copyBtn.addEventListener('click', () => {
      const content = clipboardTextarea.value;
      if (content) {
        clipboardTextarea.select();
        document.execCommand('copy');
        alert('已复制到本地剪贴板！');
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
        alert('剪贴板已清空！');
      } else {
        alert('清空失败！');
      }
    });
  </script>
</body>
</html>
`;