/*
  复制 config.example.js 为 config.js 后填写。
  GitHub Pages 部署时，config.js 会被浏览器读取。
  Supabase anon key 可以放在前端；真正的安全边界由 Supabase RLS 和 RPC 函数负责。
*/
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
};
