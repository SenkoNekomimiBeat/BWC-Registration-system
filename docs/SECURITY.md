# 安全设计说明

## GitHub Pages 的限制

GitHub Pages 只能发布静态文件，无法在服务器端保存私密管理员密码，也无法在服务器端隐藏数据库读写逻辑。

因此，本项目没有采用以下不安全方案：

- 把管理员密码写在 JavaScript 里。
- 把所有报名数据写进 JSON 文件。
- 用 localStorage 保存报名表。
- 前端直接用 QQ 号查询结果。

## 当前方案

- GitHub Pages 只负责显示网页。
- Supabase 数据库保存报名表。
- Supabase RLS 限制直接读取报名表。
- 选手只能通过 `public_lookup(secret_key)` 查询有限字段。
- 管理员必须通过 Supabase Auth 登录，且 UID 存在于 `admins` 表。

## 公开查询返回策略

| 状态 | 返回内容 |
|---|---|
| 待审核 | 只返回状态、创建时间 |
| 未通过 | 返回状态、拒绝原因 |
| 已通过 | 返回 QQ、匿名状态、参赛名称、挑战项、留言、结果文本 |

如需进一步降低信息暴露，可在 `public_lookup` 函数中移除 `qq` 或 `message`。
