# 华南奶蛙师范大学

一个使用 React + Vite 与 Koa 制作的前后端分离项目。前台包含首页、关于我们、音游群和同好群查询；管理端通过 `/#admin` 直接访问，不在前台展示入口。

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
- 管理请求需携带 `Authorization: Bearer <token>`
- 群资料默认保存在 `server/data/groups.json`，可通过 `DATA_FILE` 指定其他文件
- 待审核申请默认保存在 `server/data/applications.json`，可通过 `APPLICATIONS_FILE` 指定其他文件；通过或拒绝后会从待审核文件移除
- 只有审核通过的申请会写入群资料并展示在前台；申请人 QQ 不会通过公开接口返回
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
