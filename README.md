
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
- 直接点击蓝色**“保存”**按钮，它的有效期由你后台绑定的环境变量 ⁠EXPIRE⁠ 决定：
- 不设置变量 EXPIRE 默认保存时间为5分钟
- 设置变量 EXPIRE  “0” 代表永久有效，（例如设置 ⁠300⁠ 就是 5 分钟）。
直到你手动点击“清空”或写入新内容覆盖它





  
    
