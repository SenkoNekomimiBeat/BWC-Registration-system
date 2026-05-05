# Phigros 自制谱面比赛报名系统

这是一个可部署在 **GitHub Pages** 的静态网页项目，后端使用 **Supabase** 存储报名数据、控制查询权限和管理员权限。

## 功能

- 选手报名：QQ、匿名/非匿名、参赛名称、Tap/Hold/Flick/Drag 选择、留言。
- 自动生成 8 位查询密钥，报名成功后提示截图保存。
- 选手凭密钥查询：
  - 待审核
  - 未通过 + 拒绝原因
  - 已通过 + 报名基本信息 + 随机挑战内容
- 管理员后台：
  - Supabase Auth 登录
  - 分页查看报名
  - 预览随机结果
  - 手动修改结果文本
  - 通过 / 拒绝
  - 导出 CSV

## 为什么不是纯静态本地存储？

GitHub Pages 只能托管静态文件。  
如果把所有报名数据、管理员密码、审核逻辑都放在前端 JS 里，任何人都可以打开浏览器控制台或查看源码拿到数据。

所以本项目采用：

- GitHub Pages：托管网页。
- Supabase：托管数据库、权限、登录和受控 RPC 查询。

这样可以避免“通过控制台直接抓取所有选手 QQ 号”。

## 快速部署

### 1. 创建 Supabase 项目

进入 Supabase Dashboard，新建项目。

### 2. 执行数据库脚本

打开：

```txt
supabase/schema.sql
```

复制全部内容，粘贴到 Supabase Dashboard -> SQL Editor 执行。

### 3. 创建管理员账号

在 Supabase Dashboard -> Authentication -> Users 中创建一个管理员用户。

复制该用户的 `User UID`，然后在 SQL Editor 执行：

```sql
insert into public.admins (user_id)
values ('这里替换成管理员 User UID');
```

### 4. 填写前端配置

打开 `config.js`，替换：

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
};
```

这两个值在 Supabase Dashboard -> Project Settings -> API 中可以找到。

注意：Supabase anon key 可以公开放在前端，安全边界由 RLS 和 RPC 控制，不要把 service_role key 放进前端。

### 5. 修改挑战池文本

打开 `app.js`，找到：

```js
const CHALLENGE_POOLS = { ... }
```

按你的比赛规则替换 Hold / Flick / Drag 池文本。

Tap 随机逻辑已经按 `[13.0, 17.6]` 生成一位小数。

### 6. 上传到 GitHub Pages

方式 A：直接上传文件

1. 新建 GitHub 仓库。
2. 上传本项目根目录下所有文件。
3. 进入仓库 Settings -> Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待 GitHub Pages 生成访问链接。

方式 B：使用命令行

```bash
git init
git add .
git commit -m "init phigros contest site"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

然后在 GitHub Pages 中启用 main 分支部署。

## 文件结构

```txt
.
├── index.html
├── style.css
├── app.js
├── config.js
├── config.example.js
├── supabase/
│   └── schema.sql
└── README.md
```

## 安全说明

本项目做了以下安全处理：

1. 前端不直接读取完整报名表。
2. 匿名用户不能直接 `select` 报名表。
3. 公开查询只能调用 `public_lookup(secret_key)`，且必须提供密钥。
4. 未审核状态不返回 QQ、参赛名义、挑战项等完整信息。
5. 被拒绝状态只返回拒绝原因。
6. 已通过状态才返回选手基本信息和随机结果。
7. 管理员后台必须通过 Supabase Auth 登录，并且用户 UID 必须存在于 `admins` 表。
8. 管理员读写报名表依赖 RLS 策略，不依赖前端隐藏按钮。
9. 数据库函数先显式撤销默认公开执行权限，再按 anon/authenticated 角色授权。

## 仍需注意

- 请不要把 Supabase `service_role` key 放到 GitHub。
- 请不要把管理员密码写进 `app.js` 或 `config.js`。
- 如果密钥泄露，持有者可以查到该选手的审核结果。
- 如果需要更强安全，可以把管理员审核改成 Supabase Edge Function 或独立后端。

## 自定义建议

- `style.css`：修改颜色、标题、移动端样式。
- `index.html`：修改比赛说明、提示文案。
- `app.js`：修改挑战池、导出字段、分页数量。
- `supabase/schema.sql`：修改 QQ 校验、字段长度、查询返回字段。
