# AI+Six Sigma 前端

此仓库仅包含可公开发布的登录页、封面、前端脚本及公开连接配置。不包含受保护的四个 HTML 工具、后端源码、客户数据或私密密钥。

工具顺序：甘特图 → 流程图 → FMEA → 机床实验室。登录、账号管理、有效期授权由 Supabase portal 接口处理。工具仅在后端验证身份和授权后返回。

## 首次启用 GitHub Pages

1. 此仓库需设为 Public，或使用支持私有仓库 Pages 的套餐。
2. Settings → Pages → Build and deployment → Source 选择 GitHub Actions。
3. Actions → Publish frontend → Re-run all jobs；亦可在该工作流页面使用 Run workflow。
4. 以工作流实际输出的 URL 为准。Pages 发布不表示中国大陆网络可达性已验证。

原受保护源码仓库保持私有，不要把它的 protected-tools、server.js、部署包或生成的 Worker 文件复制到这里。

封面使用用户上传的六西格玛工具原图，完整展示帕累托分析、SPC、响应曲面与过程能力图。
