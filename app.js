const qs = (selector, parent = document) => parent.querySelector(selector);
const qsa = (selector, parent = document) => {
  if (!parent) return [];
  return [...parent.querySelectorAll(selector)];
};

let supabaseClient;
let currentPage = 0;
const pageSize = 10;
let totalRows = 0;

// 这里是挑战池。你可以按比赛规则直接修改这些文本。
const CHALLENGE_POOLS = {
  Hold: [
    "Tap Banned",
    "Hold Banned",
    "Flick Banned",
    "Drag Banned"
  ],
  Flick: [
    "astral.exe",
    "Altale",
    "Tower of Dreams"
  ],
  Drag: [
    "从整张谱面的第一个音符开始判定，至整张谱面的最后一个音符结束判定，任意没有音符被判定（包括hold的正在判定）的连续时间段不能超过一个4分音符的时长",
"最多使用4条判定线",
"整张谱面出现至少X/20（结果四舍五入）次tap或hold（头判）与drag在同一时间判定（X为全谱物量），在同一条或重合判定线内判定区域发生重叠不计入次数。",
"所有note（不包括假note）都必须在同一条判定线上判定",
"在谱面中加入至少一处文字押或图形押",
"谱面中存在两个长条，它们持续时间的总和不小于15秒（如果两个长条有同时处在判定的时刻，那么在这个时刻两个长条的持续时间分开计算），且在这两个长条的持续时间内，没有Note被判定（这两个长条除外，即两个长条可以同时判定）",
"谱面每秒平均事件数不超过15（即谱面总事件数不超过总时长（秒数）×15）",
"谱面中至少有50%的flick必须以点划形式出现。",
"谱面中至少存在30%的片段，保证至少有两条不处在重合或接近重合的判定线有配置（具体地，一个有配置的片段在中间的任意4个4分内至少存在一个音符处在判定阶段）"

  ]
};

const STATUS_LABELS = {
  pending: "待审核",
  approved: "已通过",
  rejected: "未通过"
};

document.addEventListener("DOMContentLoaded", async () => {
  initSupabase();
  bindTabs();
  bindRegistration();
  bindQuery();
  bindAdmin();
  await restoreAdminSession();
});

function initSupabase() {
  if (!window.APP_CONFIG || !window.APP_CONFIG.SUPABASE_URL || !window.APP_CONFIG.SUPABASE_ANON_KEY) {
    renderFatalConfigError();
    return;
  }

  if (window.APP_CONFIG.SUPABASE_URL.includes("YOUR_PROJECT_ID")) {
    renderFatalConfigError("尚未配置 Supabase。请先编辑 config.js。");
    return;
  }

  supabaseClient = window.supabase.createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_ANON_KEY
  );
}

function renderFatalConfigError(message = "Supabase 配置缺失。请检查 config.js。") {
  const panels = qsa(".panel");
  panels.forEach(panel => {
    panel.insertAdjacentHTML("afterbegin", `<div class="notice error">${escapeHtml(message)}</div>`);
  });
}

function bindTabs() {
  qsa(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      qsa(".tab-btn").forEach(item => item.classList.remove("active"));
      qsa(".panel").forEach(item => item.classList.remove("active"));
      btn.classList.add("active");
      qs(`#${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function bindRegistration() {
  qsa("input[name='isAnonymous']").forEach(input => {
    input.addEventListener("change", () => {
      const isAnonymous = qs("input[name='isAnonymous']:checked").value === "true";
      qs("#nameLabel").innerHTML = `${isAnonymous ? "马甲/代号" : "参赛名义"} <b>*</b>`;
    });
  });

  qs("#registrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    
    const formEl = event.target.closest("form");
    
    if (!formEl) {
      showNotice(qs("#secretBox"), "表单元素未找到，请检查 index.html 中 registrationForm 是否存在。", "error");
      return;
    }
    
    if (!supabaseClient) {
      showNotice(qs("#secretBox"), "系统尚未连接 Supabase。请检查 config.js 和 Supabase 配置。", "error");
      return;
    }
    
    const form = new FormData(formEl);
  
    const challenges = qsa("input[name='challenge']:checked").map(input => input.value);

    if (!challenges.length) {
      showNotice(qs("#secretBox"), "请至少选择一个挑战项目。", "error");
      return;
    }

    const payload = {
      p_qq: normalizeText(form.get("qq")),
      p_is_anonymous: form.get("isAnonymous") === "true",
      p_display_name: normalizeText(form.get("displayName")),
      p_challenge_items: challenges,
      p_message: normalizeText(form.get("message"))
    };

    setSubmitting(fromEl, true);

    const { data, error } = await supabaseClient.rpc("submit_registration", payload);

    setSubmitting(fromEl, false);

    if (error) {
      showNotice(qs("#secretBox"), `提交失败：${escapeHtml(error.message)}`, "error");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    const secretKey = row?.secret_key;

    if (!secretKey) {
      showNotice(qs("#secretBox"), "提交成功，但未返回查询密钥。请联系主办方检查 RPC 配置。", "warning");
      return;
    }

    fromEl.reset();
    qs("#nameLabel").innerHTML = "马甲/代号 <b>*</b>";

    showNotice(
      qs("#secretBox"),
      `<h3>报名成功！请立即截图保存查询密钥</h3>
       <div class="secret-key">${escapeHtml(secretKey)}</div>
       <p>后续只能凭该密钥查询审核状态和随机挑战内容。请不要公开发送给他人。</p>
       <button class="secondary" type="button" onclick="navigator.clipboard?.writeText('${escapeJs(secretKey)}')">复制密钥</button>`,
      "success",
      true
    );
  });
}

function bindQuery() {
  qs("#queryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient) return;

    const form = new FormData(event.currentTarget);
    const secretKey = normalizeText(form.get("secretKey")).toUpperCase();
    const box = qs("#queryResult");

    box.innerHTML = `<div class="notice">查询中……</div>`;

    const { data, error } = await supabaseClient.rpc("public_lookup", {
      p_secret_key: secretKey
    });

    if (error) {
      box.innerHTML = `<div class="notice error">查询失败：${escapeHtml(error.message)}</div>`;
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      box.innerHTML = `<div class="notice error">未找到该查询密钥对应的报名记录，请检查是否输入错误。</div>`;
      return;
    }

    if (row.status === "pending") {
      box.innerHTML = `<div class="notice warning"><h3>待审核</h3><p>报名已收到，请等待主办方审核及随机挑战内容。</p></div>`;
      return;
    }

    if (row.status === "rejected") {
      box.innerHTML = `<div class="notice error"><h3>审核未通过</h3><p>${escapeHtml(row.rejection_reason || "主办方未填写拒绝原因。")}</p></div>`;
      return;
    }

    box.innerHTML = `
      <div class="notice success">
        <h3>审核已通过</h3>
        <div class="detail-grid">
          <div><b>QQ</b><span>${escapeHtml(row.qq || "-")}</span></div>
          <div><b>匿名</b><span>${row.is_anonymous ? "是" : "否"}</span></div>
          <div><b>${row.is_anonymous ? "马甲/代号" : "参赛名义"}</b><span>${escapeHtml(row.display_name || "-")}</span></div>
          <div><b>挑战项</b><span>${escapeHtml((row.challenge_items || []).join(", "))}</span></div>
        </div>
        <h3>随机分配到的挑战内容</h3>
        <div class="result-text">${escapeHtml(row.result_text || "暂无结果文本。")}</div>
      </div>
    `;
  });
}

function bindAdmin() {
  qs("#adminLoginBtn").addEventListener("click", adminLogin);
  qs("#adminLogoutBtn").addEventListener("click", adminLogout);
  qs("#refreshAdminBtn").addEventListener("click", () => loadAdminRows());
  qs("#exportCsvBtn").addEventListener("click", exportCsv);
  qs("#prevPageBtn").addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage -= 1;
      loadAdminRows();
    }
  });
  qs("#nextPageBtn").addEventListener("click", () => {
    if ((currentPage + 1) * pageSize < totalRows) {
      currentPage += 1;
      loadAdminRows();
    }
  });
}

async function restoreAdminSession() {
  if (!supabaseClient) return;
  const { data } = await supabaseClient.auth.getSession();
  if (data?.session) {
    showAdminDashboard(true);
    await loadAdminRows();
  }
}

async function adminLogin() {
  if (!supabaseClient) return;

  const email = normalizeText(qs("#adminEmail").value);
  const password = qs("#adminPassword").value;

  if (!email || !password) {
    alert("请输入管理员邮箱和密码。");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    alert(`登录失败：${error.message}`);
    return;
  }

  currentPage = 0;
  showAdminDashboard(true);
  await loadAdminRows();
}

async function adminLogout() {
  await supabaseClient.auth.signOut();
  showAdminDashboard(false);
}

function showAdminDashboard(isLoggedIn) {
  qs("#adminLoginCard").classList.toggle("hidden", isLoggedIn);
  qs("#adminDashboard").classList.toggle("hidden", !isLoggedIn);
}

async function loadAdminRows() {
  const from = currentPage * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabaseClient
    .from("registrations")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    qs("#adminList").innerHTML = `<div class="notice error">加载失败：${escapeHtml(error.message)}。请确认当前账号已写入 admins 表。</div>`;
    return;
  }

  totalRows = count || 0;
  renderStats(data || []);
  renderAdminRows(data || []);
  qs("#pageInfo").textContent = `第 ${currentPage + 1} 页 / 共 ${Math.max(1, Math.ceil(totalRows / pageSize))} 页`;
  qs("#prevPageBtn").disabled = currentPage <= 0;
  qs("#nextPageBtn").disabled = (currentPage + 1) * pageSize >= totalRows;
}

function renderStats(rowsOnPage) {
  const pagePending = rowsOnPage.filter(row => row.status === "pending").length;
  const pageApproved = rowsOnPage.filter(row => row.status === "approved").length;
  const pageRejected = rowsOnPage.filter(row => row.status === "rejected").length;

  qs("#adminStats").innerHTML = `
    <div class="stat"><span>总报名</span><strong>${totalRows}</strong></div>
    <div class="stat"><span>本页待审</span><strong>${pagePending}</strong></div>
    <div class="stat"><span>本页通过</span><strong>${pageApproved}</strong></div>
    <div class="stat"><span>本页拒绝</span><strong>${pageRejected}</strong></div>
  `;
}

function renderAdminRows(rows) {
  const list = qs("#adminList");
  list.innerHTML = "";

  if (!rows.length) {
    list.innerHTML = `<div class="notice">暂无报名数据。</div>`;
    return;
  }

  const template = qs("#adminRowTemplate");

  rows.forEach(row => {
    const node = template.content.firstElementChild.cloneNode(true);

    qs(".js-title", node).textContent = row.display_name || "(未命名)";
    qs(".js-meta", node).textContent = `报名时间：${formatDate(row.created_at)}　密钥：${row.secret_key}`;
    qs(".js-status", node).textContent = STATUS_LABELS[row.status] || row.status;
    qs(".js-status", node).classList.add(`status-${row.status}`);
    qs(".js-qq", node).textContent = row.qq || "-";
    qs(".js-anonymous", node).textContent = row.is_anonymous ? "是" : "否";
    qs(".js-items", node).textContent = (row.challenge_items || []).join(", ");
    qs(".js-message", node).textContent = row.message || "-";
    qs(".js-result", node).value = row.result_text || "";

    qs(".js-preview", node).addEventListener("click", () => {
      qs(".js-result", node).value = generateResultText(row.challenge_items || []);
    });

    qs(".js-approve", node).addEventListener("click", async () => {
      const resultText = normalizeText(qs(".js-result", node).value) || generateResultText(row.challenge_items || []);
      const ok = confirm("确认通过该选手？通过后选手即可查询到随机挑战内容。");
      if (!ok) return;

      await updateRegistration(row.id, {
        status: "approved",
        result_text: resultText,
        rejection_reason: null,
        reviewed_at: new Date().toISOString()
      });
    });

    qs(".js-reject", node).addEventListener("click", async () => {
      const reason = prompt("请输入拒绝原因：");
      if (reason === null) return;
      if (!normalizeText(reason)) {
        alert("拒绝原因不能为空。");
        return;
      }

      await updateRegistration(row.id, {
        status: "rejected",
        rejection_reason: normalizeText(reason),
        result_text: null,
        reviewed_at: new Date().toISOString()
      });
    });

    list.appendChild(node);
  });
}

async function updateRegistration(id, patch) {
  const { error } = await supabaseClient
    .from("registrations")
    .update(patch)
    .eq("id", id);

  if (error) {
    alert(`操作失败：${error.message}`);
    return;
  }

  await loadAdminRows();
}

function generateResultText(items) {
  const lines = [];

  if (items.includes("Tap")) {
    lines.push(`【Tap】谱面定数目标：${randomTapLevel().toFixed(1)}`);
  }

  if (items.includes("Hold")) {
    lines.push(`【Hold】${pickOne(CHALLENGE_POOLS.Hold)}`);
  }

  if (items.includes("Flick")) {
    lines.push(`【Flick】${pickOne(CHALLENGE_POOLS.Flick)}`);
  }

  if (items.includes("Drag")) {
    lines.push(`【Drag】${pickOne(CHALLENGE_POOLS.Drag)}`);
  }

  return lines.join("\n");
}

function randomTapLevel() {
  const min = 130;
  const max = 176;
  return randomInt(min, max) / 10;
}

function randomInt(min, max) {
  const range = max - min + 1;
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return min + (bytes[0] % range);
}

function pickOne(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

async function exportCsv() {
  const { data, error } = await supabaseClient
    .from("registrations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    alert(`导出失败：${error.message}`);
    return;
  }

  const headers = [
    "id",
    "qq",
    "is_anonymous",
    "display_name",
    "challenge_items",
    "message",
    "secret_key",
    "status",
    "result_text",
    "rejection_reason",
    "created_at",
    "reviewed_at"
  ];

  const rows = (data || []).map(row => headers.map(key => {
    const value = Array.isArray(row[key]) ? row[key].join("|") : (row[key] ?? "");
    return csvCell(value);
  }).join(","));

  const csv = "\ufeff" + headers.join(",") + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `phigros-contest-registrations-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function setSubmitting(form, submitting) {
  if (!form) return;

  qsa("button, input, textarea", form).forEach(el => {
    el.disabled = submitting;
  });
}

function showNotice(el, html, type = "success", trustedHtml = false) {
  el.className = `notice ${type}`;
  el.innerHTML = trustedHtml ? html : escapeHtml(html);
  el.classList.remove("hidden");
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(input) {
  return String(input ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}
