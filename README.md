# 华南奶蛙师范大学

一个使用 React + Vite 与 Koa 制作的前后端分离项目。前台包含首页、关于我们、音游群、同好群查询和同好活动广场；管理端通过 `/#admin` 直接访问，不在前台展示入口。

## 本地运行

```bash
npm install
npm run dev
```

另开一个终端启动 Koa API：

```bash
cd server
npm install
npm start
```

Vite 会在开发环境把 `/api` 代理到 `127.0.0.1:3001`。

## 接口与数据

- 公开查询：`GET /api/groups`
- 宣群重复校验：`GET /api/group-applications/check?qq=<群号>`
- 提交宣群申请：`POST /api/group-applications`
- 管理登录：`POST /api/auth/login`
- 管理 CRUD：`/api/admin/groups`
- 待审核申请：`/api/admin/applications`，支持编辑、通过和拒绝
- 公开活动：`GET /api/activities`
- 提交活动：`POST /api/activity-applications`
- 活动管理：`/api/admin/activities`，支持编辑、删除、置顶与活动配图
- 活动图片：管理端通过 `POST /api/admin/activity-images` 上传，公开访问路径为 `/api/activity-images/<文件名>`
- 活动审核：`/api/admin/activity-applications`，支持编辑、通过和拒绝
- 管理请求需携带 `Authorization: Bearer <token>`
- 群资料默认保存在 `server/data/groups.json`，可通过 `DATA_FILE` 指定其他文件
- 待审核申请默认保存在 `server/data/applications.json`，可通过 `APPLICATIONS_FILE` 指定其他文件；通过或拒绝后会从待审核文件移除
- 只有审核通过的申请会写入群资料并展示在前台；申请人 QQ 不会通过公开接口返回
- 公开活动默认保存在 `server/data/activities.json`，待审活动保存在 `server/data/activity-applications.json`；申请人 QQ 只保留在待审活动中
- 活动图片在配置腾讯云 COS 后会写入 COS，公开访问仍使用 `/api/activity-images/<文件名>` 同源地址；COS 可保持私有读写，也不需要配置浏览器 CORS
- 未配置 COS 时，活动图片默认保存在 `server/data/activity-images/`；首次启用 COS 部署时，脚本会先迁移旧图片再切换后端
- COS 模式只读写 COS，本地模式只读写本地目录；迁移后的本地图片不会自动删除，可继续作为备份
- 活动数据文件只记录图片 URL；前台投稿不接受图片上传
- 多个置顶活动会排在普通活动之前，并按标题排序
- 登录令牌保存在 Koa 进程内存中，有效期 12 小时；服务重启后需重新登录

## 构建

```bash
npm run build
```

构建产物会输出到 `dist/`。

后端提供了轻量 Docker 镜像：

```bash
docker build -t naiwa-scnu-api ./server
```

## 腾讯云 COS 活动图片存储

后端使用腾讯云官方 `cos-nodejs-sdk-v5` 上传、读取和删除活动图片。请使用只具备指定存储桶与 `activity-images/` 前缀所需权限的 CAM 子账号密钥，至少包含 `cos:PutObject`、`cos:GetObject` 与 `cos:DeleteObject`。

生产服务器可从示例创建私密环境文件：

```bash
sudo cp deploy/cos.env.example /home/lighthouse/naiwa-scnu/cos.env
sudo chmod 600 /home/lighthouse/naiwa-scnu/cos.env
```

填写以下配置后重新部署，`deploy/install.sh` 会自动通过 Docker `--env-file` 注入 Koa 容器：

```dotenv
COS_SECRET_ID=CAM 子账号 SecretId
COS_SECRET_KEY=CAM 子账号 SecretKey
COS_BUCKET=完整存储桶名（必须包含 APPID）
COS_REGION=ap-hongkong
COS_PREFIX=activity-images
```

若使用临时密钥，可额外设置 `COS_SECURITY_TOKEN`。四个必填变量只要出现任意一个，后端就会要求其余配置完整，避免误以为已写入 COS、实际却退回本地存储。`GET /api/health` 的 `imageStorage` 会返回当前使用的 `cos` 或 `local`。

首次带 COS 配置部署时，`deploy/install.sh` 会在停止旧 API 容器之前执行迁移：将 `api-data/activity-images/` 中已有的 JPG、PNG、WebP 按原文件名上传到 `COS_PREFIX`，因此活动数据里的图片 URL 无需修改。迁移成功后写入 `.cos-migration.json` 标记；目标存储桶与本地文件均未变化时，后续部署会直接跳过。迁移失败则不会切换 API 容器，本地图片也不会被删除。
