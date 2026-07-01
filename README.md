
#   在线剪贴板 📋

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?style=flat-square&logo=cloudflare)

一个基于 Cloudflare Workers 的在线剪贴板分享服务。



## ✨ 使用方法
-  创建新的 Workers 项目
-  点击右上角 编辑代码
-  复制 workers 代码，部署
-  创建并绑定 KV 命名空间，变量名使用 KV
-  添加变量 TOKEN 作为安全入口路径
-  添加自定义域或路由    

### ✨ 功能特点
- 可选过期时间
- 支持密码访问
- 支持自定义短链后缀
- 可上传云端/读取


####

-  点击“保存”按钮（主剪贴板）
如果你是直接点击蓝色**“保存”**按钮，它的有效期由你后台绑定的环境变量 ⁠EXPIRE⁠ 决定：
 如果你在后台设置了 ⁠EXPIRE⁠ 变量：
 如果 ⁠EXPIRE⁠ 的值小于 60（且不等于 0），KV 会强制将其设为最低限制 60 秒（这是 Cloudflare KV 的硬性规定，少于 60 秒无法自动过期）。
 如果 ⁠EXPIRE⁠ 大于 60，则有效期就是你设置的秒数（例如设置 ⁠300⁠ 就是 5 分钟）。
 如果你没有在后台设置 ⁠EXPIRE⁠ 变量：
 代码中有一句兜底逻辑 ⁠globalThis.EXPIRE ?? 300⁠，所以默认有效期是 300 秒（5 分钟）。
 如果你在后台将 ⁠EXPIRE⁠ 显式设置为 ⁠0⁠：
 代表永久有效，直到你手动点击“清空”或写入新内容覆盖它。




  
    
