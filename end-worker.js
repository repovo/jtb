addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// 用于生成默认短链接的随机字符集函数
function generateShortId(length = 7) {//短链长度7 可自定义长度
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

  // 👉 1. 优先处理并放行“公开分享路由”
  const isShareRoute = path.startsWith('/share/');
  if (isShareRoute && request.method === 'GET') {
    const shortId = path.replace('/share/', '');
    return await handleReadKV(`share_${shortId}`);
  }

  // 获取安全入口 Token 变量
  const globalToken = globalThis.TOKEN ? globalThis.TOKEN.trim() : '';

  // 👉 2. 权限校验兜底逻辑
  const tokenPath = globalToken ? `/${globalToken}` : '';
  const homePath = tokenPath || '/';

  if (globalToken && path !== homePath && !path.startsWith(`${tokenPath}/`)) {
    return Response.redirect('https://www.google.com', 302);
  }
  
  if (!globalToken && path !== '/') {
    if(['/save', '/read', '/clear', '/manifest.json'].includes(path) === false) {
      return Response.redirect('https://www.google.com', 302);
    }
  }

  // 定义各种内部安全路由路径
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
    try {
      const body = await request.json();
      const content = body.content;
      const maxReads = Number(body.maxReads || 0);
      const customExpireSeconds = Number(body.customExpire || 0); // 接收前端统一换算好传来的绝对秒数
      let customPath = body.customPath ? body.customPath.trim() : '';

      if (!content) return new Response('empty', { status: 400 });

      const isShare = body.isShare;
      let storageKey = "clipboard";

      if (isShare) {
        if (customPath) {
          customPath = customPath.replace(/[^a-zA-Z0-9_-]/g, '');
          if (['save', 'read', 'clear', 'manifest.json'].includes(customPath)) {
            return new Response(JSON.stringify({ status: 'failed', message: '不允许使用系统保留词作为自定义路径' }), { status: 400 });
          }
          storageKey = `share_${customPath}`;
        } else {
          storageKey = `share_${generateShortId(7)}`;//短链长度7 可自定义长度
        }
      }

      // 👉 计算过期时间逻辑
      let KVexpireTime = {};
      let finalExpire = customExpireSeconds > 0 ? customExpireSeconds : Number(globalThis.EXPIRE ?? 300);

      if (finalExpire !== 0) {
        // Cloudflare KV 要求最低生存时间必须大于等于 60 秒
        KVexpireTime.expirationTtl = finalExpire < 60 ? 60 : finalExpire;
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

  return Response.redirect('https://www.google.com', 302);
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
  "background_color": "#050816",
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
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #050816; font-family: 'Helvetica Neue', Arial, sans-serif; }
    
    /* 背景画布及遮罩 */
    canvas { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 1; }
    .overlay {
      position: fixed; inset: 0; z-index: 2; pointer-events: none;
      background:
        radial-gradient(circle at 20% 30%, rgba(0,255,255,.18), transparent 30%),
        radial-gradient(circle at 80% 20%, rgba(255,0,180,.18), transparent 30%),
        radial-gradient(circle at 50% 80%, rgba(0,120,255,.16), transparent 35%);
      backdrop-filter: blur(30px);
      -webkit-backdrop-filter: blur(30px);
    }

    /* 内容容器层 */
    .wrapper { position: relative; z-index: 3; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow-y: auto; }
    
    h1 { color: #fff; margin-bottom: 20px; font-size: 2.2em; font-weight: 600; opacity: 0; animation: fadeIn 1s ease-in-out forwards; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
    
    /* 磨砂玻璃卡片 */
    .container { 
      background: rgba(255, 255, 255, 0.08); 
      border-radius: 20px; 
      border: 1px solid rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(16px); 
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35); 
      padding: 35px 40px; 
      width: 85%; 
      max-width: 500px; 
      box-sizing: border-box;
    }
    
    /* 输入框 */
    textarea { width: 100%; height: 180px; margin-bottom: 15px; padding: 15px; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; font-size: 16px; resize: vertical; color: #fff; background-color: rgba(255, 255, 255, 0.05); box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2); box-sizing: border-box; }
    textarea:focus { outline: none; box-shadow: 0 0 8px 2px rgba(52, 152, 219, 0.6); border-color: rgba(52, 152, 219, 0.5); }
    textarea::placeholder { color: rgba(255,255,255,0.4); }
    
    /* 配置行 */
    .config-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; font-size: 14px; color: rgba(255,255,255,0.8); }
    .config-row div { display: flex; align-items: center; }
    .config-row label { margin-right: 8px; }
    .config-row input, .config-row select { padding: 6px 8px; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; background-color: rgba(255,255,255,0.1); color: #fff; outline: none; }
    .config-row input:focus, .config-row select:focus { border-color: #3498db; }
    .config-row option { background-color: #1a1c24; color: #fff; }
    .input-small { width: 55px; text-align: center; }
    .select-small { padding: 5px 6px !important; margin-left: 4px; font-size: 13px; }
    .input-medium { width: 140px; }
    
    /* 分享结果区域 */
    .share-result-area { display: none; background: rgba(46, 204, 113, 0.15); border: 1px dashed rgba(46, 204, 113, 0.4); padding: 12px; border-radius: 8px; margin-bottom: 15px; align-items: center; justify-content: space-between; }
    .share-url-text { font-size: 14px; font-weight: bold; color: #2ecc71; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin-right: 10px; }
    .inline-copy-btn { background: #2ecc71; color: #fff; border: none; padding: 6px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; white-space: nowrap; }
    .inline-copy-btn:hover { background: #27ae60; }
    
    /* 按钮组 */
    .button-group { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
    button { background: linear-gradient(135deg, rgba(52, 152, 219, 0.8) 0%, rgba(41, 128, 185, 0.8) 100%); color: white; border: 1px solid rgba(41, 128, 185, 0.5); padding: 12px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.2s ease-in-out; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15); flex-grow: 1; min-width: 100px; }
    button:hover { background: linear-gradient(135deg, #2980b9 0%, #3498db 100%); transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2); }
    button:active { transform: translateY(0); box-shadow: none; }
    button i { margin-right: 6px; font-size: 15px; }
    
    @media (max-width: 768px) { 
      .container { padding: 25px 20px; width: 90%; } 
      textarea { height: 150px; font-size: 15px; } 
      button { padding: 10px 14px; font-size: 13px; } 
      h1 { font-size: 1.8em; } 
      .config-row { flex-direction: column; align-items: flex-start; gap: 10px; } 
    }
    
    .loading { position: relative; color: transparent !important; }
    .loading i { display: none; }
    .loading::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; border-color: #fff transparent #fff transparent; animation: loading 1.2s linear infinite; }
    @keyframes loading { 0% { transform: translate(-50%, -50%) rotate(0deg); } 100% { transform: translate(-50%, -50%) rotate(360deg); } }
    @keyframes fadeIn { 0% { opacity: 0; transform: translateY(-20px); } 100% { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div class="overlay"></div>

  <div class="wrapper">
    <div class="container">
      <h1>在线剪贴板</h1>
      <textarea id="clipboard" placeholder="在此处粘贴内容..."></textarea>
      
      <div class="config-row">
        <div>
          <label for="maxReadsInput"><i class="fas fa-eye-slash"></i> 次数:</label>
          <input type="number" id="maxReadsInput" class="input-small" min="0" value="0" title="0代表不限制">
        </div>
        <div>
          <label for="expireInput"><i class="fas fa-clock"></i> 过期:</label>
          <input type="number" id="expireInput" class="input-small" min="0" value="0" placeholder="默认" title="不填或0使用后台默认">
          <select id="expireUnit" class="select-small">
            <option value="60">分钟</option>
            <option value="3600">小时</option>
            <option value="86400" selected>天</option>
          </select>
        </div>
      </div>
      
      <div class="config-row" style="justify-content: flex-start;">
        <label for="customPathInput"><i class="fas fa-link"></i> 自定义短链后缀:</label>
        <input type="text" id="customPathInput" class="input-medium" placeholder="选填, 如 mylink">
      </div>

      <div class="share-result-area" id="shareResultArea">
        <span class="share-url-text" id="shareUrlText"></span>
        <button class="inline-copy-btn" id="inlineCopyBtn"><i class="fas fa-copy" style="margin-right:3px; font-size:12px;"></i>复制链接</button>
      </div>

      <div class="button-group">
        <button id="saveBtn"><i class="fas fa-cloud-upload-alt"></i>保存</button>
        <button id="readBtn"><i class="fas fa-cloud-download-alt"></i>读取</button>
        <button id="shareBtn" style="background: linear-gradient(135deg, rgba(230, 126, 34, 0.8) 0%, rgba(211, 84, 0, 0.8) 100%); border-color: rgba(211, 84, 0, 0.5);"><i class="fas fa-share-alt"></i>生成分享链接</button>
        <button id="copyBtn"><i class="fas fa-copy"></i>复制内容</button>
        <button id="clearBtn" style="background: linear-gradient(135deg, rgba(231, 76, 60, 0.7) 0%, rgba(192, 41, 43, 0.7) 100%); border-color: rgba(192, 41, 43, 0.4);"><i class="fas fa-trash-alt"></i>清空</button>
      </div>
    </div>
  </div>

  <script>
    // ====== Aurora 背景 Canvas 动画逻辑 ======
    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");
    let w, h, mouse = { x: 0, y: 0 };
    
    function resize() { 
      w = canvas.width = window.innerWidth; 
      h = canvas.height = window.innerHeight; 
    }
    window.addEventListener("resize", resize); 
    resize();
    
    window.addEventListener("pointermove", e => { 
      mouse.x = e.clientX; 
      mouse.y = e.clientY; 
    });
    
    const pts = [...Array(120)].map(() => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, 
      r: 1 + Math.random() * 2
    }));
    
    let t = 0;
    function blob(x, y, r, c) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    
    function frame() {
      t += 0.003;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#050816"; ctx.fillRect(0, 0, w, h);
      blob(w * .3 + Math.sin(t * 1.4) * 140, h * .4 + Math.cos(t) * 120, 320, "rgba(0,255,255,.16)");
      blob(w * .7 + Math.cos(t * .8) * 150, h * .35 + Math.sin(t * 1.2) * 130, 300, "rgba(255,0,170,.15)");
      blob(w * .5 + Math.sin(t * .5) * 180, h * .75 + Math.cos(t * .9) * 90, 360, "rgba(0,120,255,.14)");
      blob(mouse.x, mouse.y, 180, "rgba(255,255,255,.05)");
      
      ctx.fillStyle = "rgba(255,255,255,.75)";
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    frame();

    // ====== 剪贴板原行业务 JavaScript 逻辑 ======
    const clipboardTextarea = document.getElementById('clipboard');
    const saveBtn = document.getElementById('saveBtn');
    const readBtn = document.getElementById('readBtn');
    const shareBtn = document.getElementById('shareBtn');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const maxReadsInput = document.getElementById('maxReadsInput');
    const expireInput = document.getElementById('expireInput');
    const expireUnit = document.getElementById('expireUnit');
    const customPathInput = document.getElementById('customPathInput');
    
    const shareResultArea = document.getElementById('shareResultArea');
    const shareUrlText = document.getElementById('shareUrlText');
    const inlineCopyBtn = document.getElementById('inlineCopyBtn');

    let currentShareUrl = "";

    function copyToClipboard(text) {
      const tempInput = document.createElement('input');
      tempInput.value = text;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }

    function getCalculatedSeconds() {
      const val = Number(expireInput.value || 0);
      const unit = Number(expireUnit.value);
      return val * unit;
    }

    saveBtn.addEventListener('click', async () => {
      const content = clipboardTextarea.value;
      if (content) {
        saveBtn.classList.add('loading');
        const response = await fetch(savePath, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content, maxReads: maxReadsInput.value, customExpire: getCalculatedSeconds(), isShare: false }) 
        });
        saveBtn.classList.remove('loading');
        if (response.ok) {
          alert('已保存到云端主链接！');
        } else {
          alert('保存失败！');
        }
      } else {
        alert('剪贴板为空！');
      }
    });

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
            customExpire: getCalculatedSeconds(),
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
