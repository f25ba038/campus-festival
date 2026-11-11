(function () {
  "use strict";
  const D = FestivalDomain,
    KEY = "campus-festival-v1";
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  let state,
    storageWarning = "",
    filterText = "",
    filterStatus = "",
    groupFilter = "active",
    sortKey = "id",
    loanDate = today(),
    editing = null,
    saveError = "",
    hasUnsavedChanges = false,
    toastTimer;
  try {
    const saved = localStorage.getItem(KEY);
    state = saved ? JSON.parse(saved) : structuredClone(FestivalSeed);
    if (!Array.isArray(state.groups) || !Array.isArray(state.applications))
      throw Error("形式");
  } catch (e) {
    state = structuredClone(FestivalSeed);
    storageWarning =
      "保存済みデータを読み込めなかったため、初期データを表示しています。必要ならバックアップから復元してください。";
  }
  let lastSavedState = JSON.stringify(state);
  const labels = {
    draft: "下書き",
    submitted: "承認待ち",
    approved: "承認済み",
    rejected: "差し戻し",
    cancelled: "取消",
    active: "対応中",
    reserved: "予約",
    returned: "返却済み",
    todo: "未着手",
    done: "完了",
  };
  const pages = {
    dashboard: ["◈", "ダッシュボード", "OVERVIEW"],
    groups: ["◎", "団体・メンバー", "ORGANIZATIONS"],
    applications: ["▤", "出店申請", "APPLICATIONS"],
    reservations: ["▦", "会場予約", "VENUES"],
    loans: ["▣", "備品・貸出", "EQUIPMENT"],
    expenses: ["¥", "予算・経費", "FINANCE"],
    shifts: ["◷", "スタッフ配置", "STAFF"],
    tasks: ["☑", "タスク", "TASKS"],
    notices: ["◉", "お知らせ", "NOTICES"],
    settings: ["⚙", "データ管理", "SETTINGS"],
  };
  const fields = {
    groups: [
      ["name", "団体名", "text"],
      ["representative", "代表者", "text"],
      ["members", "所属人数", "number"],
      ["budget", "予算（円）", "number"],
    ],
    applications: [
      ["title", "企画名", "text"],
      ["groupId", "申請団体", "group"],
      ["venueId", "希望会場", "venue"],
      ["date", "開催日", "date"],
      ["start", "開始時刻", "time"],
      ["end", "終了時刻", "time"],
      ["attendees", "参加予定人数", "number"],
      ["status", "状態", "applicationStatus"],
      ["note", "補足", "textarea"],
    ],
    reservations: [
      ["applicationId", "関連する出店申請", "application"],
      ["groupId", "利用団体", "group"],
      ["venueId", "会場", "venue"],
      ["date", "利用日", "date"],
      ["start", "開始時刻", "time"],
      ["end", "終了時刻", "time"],
      ["attendees", "参加予定人数", "number"],
      ["status", "状態", "reservationStatus"],
    ],
    loans: [
      ["equipmentId", "備品", "equipment"],
      ["groupId", "利用団体", "group"],
      ["applicationId", "関連する出店申請", "application"],
      ["quantity", "数量", "number"],
      ["due", "返却期限", "date"],
      ["status", "状態", "loanStatus"],
    ],
    expenses: [
      ["title", "経費名", "text"],
      ["groupId", "団体", "group"],
      ["category", "分類", "category"],
      ["amount", "金額（円）", "number"],
      ["date", "発生日", "date"],
      ["status", "状態", "expenseStatus"],
    ],
    shifts: [
      ["name", "スタッフ名", "text"],
      ["groupId", "所属団体", "group"],
      ["date", "担当日", "date"],
      ["start", "開始時刻", "time"],
      ["end", "終了時刻", "time"],
      ["location", "担当場所", "text"],
    ],
    tasks: [
      ["title", "タスク名", "text"],
      ["groupId", "団体", "group"],
      ["owner", "担当者", "text"],
      ["due", "期限", "date"],
      ["status", "状態", "taskStatus"],
      ["note", "補足", "textarea"],
    ],
    notices: [
      ["title", "件名", "text"],
      ["groupId", "対象団体", "audience"],
      ["date", "掲載日", "date"],
      ["body", "本文", "textarea"],
    ],
  };
  const prefixes = {
    groups: "G",
    applications: "A",
    reservations: "R",
    loans: "L",
    expenses: "X",
    shifts: "S",
    tasks: "T",
    notices: "N",
  };
  function page() {
    return location.hash.slice(1).split("?")[0] || "dashboard";
  }
  function today() {
    return new Date().toLocaleDateString("sv-SE");
  }
  function money(n) {
    return (
      "¥" +
      Number(n).toLocaleString("ja-JP", { maximumFractionDigits: 20 })
    );
  }
  function dateWithWeekday(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return esc(value);
    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day)
    )
      return esc(value);
    return `${esc(value)}（${"日月火水木金土"[date.getDay()]}）`;
  }
  function name(collection, id) {
    return state[collection].find((r) => r.id === id)?.name || "未設定";
  }
  function groupLabel(id) {
    const group = state.groups.find((g) => g.id === id);
    if (!group) return "未設定";
    return `${esc(group.name)}${group.archivedAt ? ' <small class="subtitle">（削除済み）</small>' : ""}`;
  }
  function badge(v) {
    return `<span class="badge ${esc(v)}">${esc(labels[v] || v)}</span>`;
  }
  function toast(msg) {
    $("#toast").textContent = msg;
    $("#toast").style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#toast").style.display = "none"), 4000);
  }
  function save(message) {
    state.activity.unshift({ at: new Date().toISOString(), message });
    state.activity = state.activity.slice(0, 100);
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(KEY, serialized);
      lastSavedState = serialized;
    } catch (e) {
      state = JSON.parse(lastSavedState);
      const quotaExceeded =
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        e.code === 22 ||
        e.code === 1014;
      saveError = quotaExceeded
        ? "保存容量の上限に達しました。入力内容は画面に保持しています。空き容量を確保するか、入力画面を閉じる前に内容を控えてください。"
        : "保存できませんでした。入力内容は画面に保持しています。ブラウザーの保存設定を確認してください。";
      toast(saveError);
      return false;
    }
    saveError = "";
    hasUnsavedChanges = false;
    if (message) toast("保存完了：" + message);
    return true;
  }
  function download(filename, text, type = "application/json") {
    const blob = new Blob(["\ufeff", text], { type: type + ";charset=utf-8" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function head(title, sub, action = "") {
    return `<div class="page-head"><div><div class="eyebrow">CAMPUS FESTIVAL / ${pages[page()]?.[2] || "WORKSPACE"}</div><h1>${title}</h1><p class="subtitle">${sub}</p></div>${action}</div>`;
  }
  function stat(label, value, hint) {
    return `<div class="stat"><small>${label}</small><strong class="mono">${value}</strong><div class="hint">${hint}</div></div>`;
  }
  function panel(title, body, link = "") {
    return `<div class="panel"><div class="panel-title"><h2>${title}</h2>${link}</div><div class="panel-body">${body}</div></div>`;
  }
  function renderDashboard() {
    const activeGroups = state.groups.filter((g) => !g.archivedAt);
    const rate = D.completion(state),
      budget = activeGroups.reduce((n, g) => n + Number(g.budget), 0);
    return (
      head(
        "運営の今を、ひと目で。",
        "申請から当日の配置まで、チームの動きをここに。",
      ) +
      `<div class="hero"><div><div class="eyebrow">NOVEMBER 14 — 15, 2026</div><h2>つながるアイデア、広がるキャンパス。</h2><p>学園祭の準備状況を確認して、今日の一歩を進めましょう。</p></div><div class="hero-mark">26 / F</div></div>` +
      `<div class="stats">${stat("出店申請", state.applications.length + "<small> 件</small>", "承認待ち " + D.pending(state) + " 件")}${stat("参加団体", activeGroups.length + "<small> 団体</small>", "所属メンバー " + D.groupMembers(state) + " 名")}${stat("承認済み経費", money(D.expenses(state)), "総予算 " + money(budget))}${stat("タスク完了率", rate + "<small> %</small>", "期限超過 " + D.overdueTasks(state, today()).length + " 件")}</div>` +
      `<div class="grid2">${panel(
        "承認待ちの出店申請",
        state.applications
          .filter((a) => a.status === "submitted")
          .map(
            (a) =>
              `<div class="notice-row"><small>${groupLabel(a.groupId)} / ${esc(a.date)}</small><b>${esc(a.title)}</b>${badge(a.status)}</div>`,
          )
          .join("") || "<p>承認待ちの申請はありません。</p>",
        '<a href="#applications">申請一覧 →</a>',
      )}${panel(
        "運営からのお知らせ",
        D.notices(state, state.groupId)
          .slice(0, 3)
          .map(
            (n) =>
              `<div class="notice-row"><small>${esc(n.date)} / ${n.groupId === "all" ? "全体" : groupLabel(n.groupId)}</small><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div>`,
          )
          .join(""),
        '<a href="#notices">すべて見る →</a>',
      )}</div>` +
      `<div class="grid2">${panel("団体別の予算残額", activeGroups.map((g) => `<div class="metric-line"><span>${esc(g.name)}</span><b>${money(D.remaining(state, g.id))}</b></div><div class="progress"><span style="width:${Math.max(0, Math.min(100, ((g.budget - D.expenses(state, g.id)) / Math.max(1, g.budget)) * 100))}%"></span></div>`).join(""))}${panel(
        "最近の操作",
        state.activity
          .slice(0, 6)
          .map(
            (a) =>
              `<div class="notice-row"><small>${esc(new Date(a.at).toLocaleString("ja-JP"))}</small><b>${esc(a.message)}</b></div>`,
          )
          .join("") || '<p class="subtitle">まだ操作履歴はありません。</p>',
      )}</div>`
    );
  }
  function columns(p) {
    switch (p) {
      case "groups":
        return [
          ["id", "ID"],
          ["name", "団体名"],
          ["representative", "代表者"],
          ["members", "人数"],
          ["budget", "予算"],
          ["_remaining", "残額"],
          ["_archive", "状態"],
        ];
      case "applications":
        return [
          ["id", "ID"],
          ["title", "企画名"],
          ["groupId", "団体"],
          ["venueId", "会場"],
          ["date", "開催日"],
          ["_time", "時間"],
          ["attendees", "人数"],
          ["status", "状態"],
        ];
      case "reservations":
        return [
          ["id", "ID"],
          ["venueId", "会場"],
          ["groupId", "団体"],
          ["date", "利用日"],
          ["_time", "時間"],
          ["attendees", "人数"],
          ["status", "状態"],
        ];
      case "loans":
        return [
          ["id", "ID"],
          ["equipmentId", "備品"],
          ["groupId", "団体"],
          ["quantity", "数量"],
          ["due", "返却期限"],
          ["status", "状態"],
          ["_late", "期限確認"],
        ];
      case "expenses":
        return [
          ["id", "ID"],
          ["title", "経費名"],
          ["groupId", "団体"],
          ["category", "分類"],
          ["amount", "金額"],
          ["date", "発生日"],
          ["status", "状態"],
        ];
      case "shifts":
        return [
          ["id", "ID"],
          ["name", "氏名"],
          ["groupId", "団体"],
          ["date", "担当日"],
          ["_time", "時間"],
          ["location", "担当場所"],
          ["_hours", "時間数"],
        ];
      case "tasks":
        return [
          ["id", "ID"],
          ["title", "タスク"],
          ["groupId", "団体"],
          ["owner", "担当者"],
          ["due", "期限"],
          ["status", "状態"],
        ];
      case "notices":
        return [
          ["id", "ID"],
          ["title", "件名"],
          ["groupId", "対象"],
          ["date", "掲載日"],
          ["body", "本文"],
        ];
    }
  }
  function cell(r, k) {
    if (k === "groupId")
      return r[k] === "all" ? "全体" : groupLabel(r[k]);
    if (k === "venueId") return esc(name("venues", r[k]));
    if (k === "equipmentId") return esc(name("equipment", r[k]));
    if (k === "status")
      return (
        badge(r[k]) +
        (r.reapprovalPending && r.status !== "approved"
          ? ' <span class="badge submitted">再承認待ち</span>'
          : "") +
        (r.status === "rejected" && r.rejectReason
          ? `<div class="subtitle">理由：${esc(r.rejectReason)}</div>`
          : "")
      );
    if (k === "amount" || k === "budget") return money(r[k]);
    if (k === "date" || k === "due") return dateWithWeekday(r[k]);
    if (k === "_remaining") return money(D.remaining(state, r.id));
    if (k === "_archive")
      return r.archivedAt
        ? "削除済み " + esc(r.archivedAt.slice(0, 10).replace(/-/g, "/"))
        : "登録中";
    if (k === "_time") return esc(r.start) + " – " + esc(r.end);
    if (k === "_hours") return D.shiftHours(r) + " h";
    if (k === "_late")
      return D.loanOverdue(r, today())
        ? '<span class="badge rejected">期限超過</span>'
        : "—";
    return esc(r[k]);
  }
  function renderList(p) {
    let rows = p === "notices" ? D.notices(state, state.groupId) : state[p];
    if (p === "groups")
      rows = rows.filter((group) =>
        groupFilter === "all"
          ? true
          : groupFilter === "archived"
            ? Boolean(group.archivedAt)
            : !group.archivedAt,
      );
    rows = D.search(rows, filterText);
    if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
    rows =
      p === "tasks" && sortKey === "id"
        ? D.taskOrder(rows)
        : D.sort(rows, sortKey);
    const cols = columns(p),
      statuses = [...new Set(state[p].map((r) => r.status).filter(Boolean))];
    let summary = "";
    if (p === "loans")
      summary = `<div class="toolbar"><label class="filters">対象日 <input id="loan-date" type="date" aria-label="貸出可能数の対象日" value="${esc(loanDate)}"></label></div><div class="stats">${state.equipment.map((e) => stat(esc(e.name), D.available(state, e.id, loanDate) + "<small> / " + e.stock + "</small>", "貸出可能 / 台帳数（" + dateWithWeekday(loanDate) + "時点・予約と貸出中を除く）")).join("")}</div>`;
    if (p === "reservations")
      summary = `<div class="stats">${state.venues.map((v) => stat(esc(v.name), v.capacity + "<small> 名</small>", "予約 " + D.venueUsage(state, v.id) + " 件")).join("")}</div>`;
    if (p === "expenses")
      summary = `<div class="stats">${stat("承認済み経費合計", money(D.expenses(state)), "全団体の承認済み経費")}${stat("総予算", money(state.groups.filter((g) => !g.archivedAt).reduce((n, g) => n + Number(g.budget), 0)), "登録中の団体の予算")}</div>`;
    const exportButton =
      '<button class="secondary" id="export-csv">CSV出力</button>';
    return (
      head(
        pages[p][1],
        `${rows.length}件を表示中。検索・編集して準備を進めましょう。`,
        `<button id="add-row">＋ 新規登録</button>`,
      ) +
      summary +
      `<div class="toolbar"><div class="filters"><input id="search" type="search" aria-label="一覧を検索" placeholder="キーワードで検索" value="${esc(filterText)}">${p === "groups" ? `<select id="group-filter" aria-label="団体の表示"><option value="active" ${groupFilter === "active" ? "selected" : ""}>登録中</option><option value="archived" ${groupFilter === "archived" ? "selected" : ""}>削除済みの履歴</option><option value="all" ${groupFilter === "all" ? "selected" : ""}>すべて</option></select>` : ""}${statuses.length ? `<select id="status-filter" aria-label="状態で絞り込み"><option value="">すべての状態</option>${statuses.map((s) => `<option value="${s}" ${filterStatus === s ? "selected" : ""}>${labels[s] || s}</option>`).join("")}</select>` : ""}<select id="sort" aria-label="並び順">${cols
        .filter((c) => !c[0].startsWith("_"))
        .map(
          (c) =>
            `<option value="${c[0]}" ${sortKey === c[0] ? "selected" : ""}>${c[1]}順</option>`,
        )
        .join(
          "",
        )}</select><span class="subtitle">${rows.length} 件表示</span></div>${exportButton}</div>` +
      `<div class="panel"><div class="table-scroll"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join("")}<th>操作</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td class="${["title", "body", "name"].includes(c[0]) ? "description" : ""}">${cell(r, c[0])}</td>`).join("")}<td><div class="actions"><button class="secondary small" data-edit="${esc(r.id)}">編集</button>${p === "applications" ? `<button class="small" data-approve="${esc(r.id)}">承認</button><button class="secondary small" data-reject="${esc(r.id)}">差し戻し</button><button class="danger small" data-cancel="${esc(r.id)}">取消</button>` : ""}${p === "loans" && r.status === "active" ? `<button class="small" data-return="${esc(r.id)}">返却</button>` : ""}${p === "tasks" ? `<button class="small" data-done="${esc(r.id)}">完了</button>` : ""}${p === "groups" ? (r.archivedAt ? `<button class="small" data-restore-group="${esc(r.id)}">復元</button>` : `<button class="danger small" data-delete="${esc(r.id)}">履歴へ</button>`) : `<button class="danger small" data-delete="${esc(r.id)}">削除</button>`}</div></td></tr>`).join("") : `<tr><td colspan="${cols.length + 1}" class="empty">該当するデータはありません。</td></tr>`}</tbody></table></div></div>`
    );
  }
  function renderSettings() {
    return (
      head("データを、手元に。", "保存・復元と、操作する団体を管理します。") +
      `<div class="help">これはブラウザ内で動く演習用システムです。ログイン認証や共同データ保存はありません。役割・団体の切り替えは業務操作の体験用です。同じデータで確認するときはJSONファイルを共有してください。端末やブラウザが変わると保存先も変わります。</div><div class="settings-grid">${panel("バックアップ", '<p>現在の業務データをJSONファイルとして保存します。</p><button id="backup">JSONを書き出す</button>')}${panel("データを復元", '<p>JSONファイルを読み込み、現在のデータを置き換えます。</p><input id="restore-file" aria-label="復元するJSON" type="file" accept=".json"><button id="restore" class="secondary">読み込む</button>')}${panel("操作する団体", `<p>団体代表として表示する団体を選択します。</p><select id="current-group" aria-label="操作する団体">${state.groups.filter((g) => !g.archivedAt).map((g) => `<option value="${g.id}" ${g.id === state.groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>`)}${panel("サンプルデータへ戻す", '<p>編集内容を破棄して、最初の状態に戻します。実行前にバックアップを保存してください。</p><button id="reset" class="danger">初期データへ戻す</button>')}</div>`
    );
  }
  function render() {
    let p = page();
    if (!pages[p]) {
      location.hash = "dashboard";
      return;
    }
    $("#role").value = state.role;
    $("#nav").innerHTML = Object.entries(pages)
      .map(
        ([k, v]) =>
          `<a href="#${k}" class="${p === k ? "active" : ""}"><span class="nav-icon">${v[0]}</span>${v[1]}</a>`,
      )
      .join("");
    $("#breadcrumb").textContent = "WORKSPACE / " + pages[p][2];
    $("#content").innerHTML =
      (storageWarning ? `<div class="help">${esc(storageWarning)}</div>` : "") +
      (p === "dashboard"
        ? renderDashboard()
        : p === "settings"
          ? renderSettings()
          : renderList(p));
    bind(p);
  }
  function options(type, selectedId) {
    if (type === "group" || type === "audience")
      return [
        ...(type === "audience" ? [["all", "全体"]] : []),
        ...state.groups
          .filter((g) => !g.archivedAt || g.id === selectedId)
          .map((g) => [
            g.id,
            g.name + (g.archivedAt ? "（削除済み）" : ""),
          ]),
      ];
    if (type === "venue") return state.venues.map((v) => [v.id, v.name]);
    if (type === "equipment") return state.equipment.map((e) => [e.id, e.name]);
    if (type === "application")
      return [
        ["", "関連なし"],
        ...state.applications.map((a) => [a.id, a.title]),
      ];
    const map = {
      applicationStatus: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "cancelled",
      ],
      reservationStatus: ["approved", "cancelled"],
      loanStatus: ["reserved", "active", "returned"],
      expenseStatus: ["submitted", "approved", "rejected"],
      taskStatus: ["todo", "active", "done"],
      category: ["備品", "消耗品", "外注", "広報", "その他"],
    };
    return (map[type] || []).map((s) => [s, labels[s] || s]);
  }
  function openEditor(p, id) {
    const original = id ? state[p].find((r) => r.id === id) : null;
    let row = original ? D.editCopy(original) : {};
    if (p === "expenses" && original) row = D.expenseForEdit(original);
    // 保存前の入力で承認済み申請そのものが書き換わらないよう、複製を編集する
    if (p === "applications" && original) row = { ...original };
    // 貸出可能数を超えて保存できなかった数量が画面上の貸出に残らないよう、複製を編集する
    if (p === "loans" && original) row = { ...original };
    editing = { p, id, row, original };
    $("#form-status").textContent = "";
    $("#dialog-title").textContent =
      pages[p][1] + " / " + (id ? "編集" : "新規登録");
    $("#form-fields").innerHTML = fields[p]
      .map(([k, label, type]) => {
        const value =
          row[k] ?? (type === "date" ? today() : type === "number" ? "0" : "");
        let input;
        if (type === "textarea")
          input = `<textarea name="${k}">${esc(value)}</textarea>`;
        else if (["text", "number", "date", "time"].includes(type))
          input = `<input name="${k}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(value)}" ${["title", "name"].includes(k) ? "required" : ""}>`;
        else
          input = `<select name="${k}">${          options(type, row[k])
            .map(
              ([v, t]) =>
                `<option value="${esc(v)}" ${String(value) === v ? "selected" : ""}>${esc(t)}</option>`,
            )
            .join("")}</select>`;
        return `<div class="field"><label for="field-${k}">${label}</label>${input.replace('name="' + k + '"', 'id="field-' + k + '" name="' + k + '"')}</div>`;
      })
      .join("") + (p === "applications" ? applicationHistory(original) : "");
    $("#editor").showModal();
  }
  function applicationHistory(a) {
    const notice =
      a?.status === "approved"
        ? '<div class="help">承認済みです。会場・開催日・時刻・団体・人数を変更すると、再承認が完了するまで承認待ちとなり、関連する会場予約は取り消されます。</div>'
        : a?.reapprovalPending
          ? '<div class="help">重要項目が変更されたため再承認待ちです。実行委員が一覧の「承認」ボタンで再承認すると、会場予約に変更内容が反映されます。</div>'
          : a?.status === "rejected" && a.rejectReason
            ? `<div class="help"><b>差し戻し理由</b><br>${esc(a.rejectReason)}</div>`
            : "";
    const history = a?.changeHistory || [];
    if (!history.length) return notice;
    const roles = { admin: "実行委員", leader: "団体代表", staff: "一般スタッフ" };
    const types = {
      reapprovalRequired: "重要項目の変更（再承認が必要）",
      edited: "変更",
      reapproved: "再承認",
      rejected: "差し戻し",
    };
    const label = (k) =>
      fields.applications.find((f) => f[0] === k)?.[1] || k;
    const value = (k, v) =>
      k === "venueId"
        ? esc(name("venues", v))
        : k === "groupId"
          ? groupLabel(v)
          : k === "date"
            ? dateWithWeekday(v)
            : esc(v);
    return (
      notice +
      `<div class="field"><label>変更履歴</label><div>${[...history]
        .reverse()
        .map(
          (h) =>
            `<div class="notice-row"><small>${esc(new Date(h.at).toLocaleString("ja-JP"))} / ${esc(roles[h.role] || h.role)}</small><b>${esc(types[h.type] || h.type)}</b>${h.reason ? `<div>理由：${esc(h.reason)}</div>` : ""}${(h.changes || []).map((c) => `<div>${esc(label(c.field))}：${value(c.field, c.before)} → ${value(c.field, c.after)}</div>`).join("")}</div>`,
        )
        .join("")}</div></div>`
    );
  }
  function validate(p, r) {
    const original = p === "applications"
      ? state.applications.find((application) => application.id === r.id)
      : null;
    if (
      p === "applications" &&
      r.status === "approved" &&
      !D.canApprove(state.role) &&
      original?.status !== "approved"
    )
      return "実行委員のみ出店申請を承認できます";
    if (
      p === "applications" &&
      r.status === "approved" &&
      original?.status !== "approved"
    )
      return "承認（再承認）は一覧の「承認」ボタンから行ってください";
    if (
      p === "applications" &&
      r.status === "rejected" &&
      original?.status !== "rejected"
    )
      return "差し戻しは一覧の「差し戻し」ボタンから理由を入力して行ってください";
    if (
      !D.validateRequired(
        r,
        fields[p]
          .filter((f) =>
            [
              "title",
              "name",
              "groupId",
              "venueId",
              "equipmentId",
              "date",
              "due",
              "start",
              "end",
            ].includes(f[0]),
          )
          .map((f) => f[0]),
      )
    )
      return "必須項目を入力してください";
    if (p === "expenses") return D.validateExpense(r);
    if (p === "groups" && D.duplicateGroup(state, r.name, r.id))
      return "同じ名前の団体が存在します";
    if (["applications", "reservations", "shifts"].includes(p)) {
      const err = D.validateTime(r);
      if (err) return err;
      if (p !== "shifts") {
        const v = state.venues.find((v) => v.id === r.venueId);
        if (v && D.capacityExceeded(r.attendees, v.capacity))
          return "会場の定員を超えています";
        if (p === "reservations" && D.venueConflict(state, r))
          return "会場の予約時間が重複しています";
        if (p === "reservations" && r.applicationId && r.status !== "cancelled") {
          const linked = state.applications.find(
            (a) => a.id === r.applicationId,
          );
          if (
            linked &&
            (linked.status !== "approved" ||
              D.reapprovalFields.some(
                (k) => String(linked[k]) !== String(r[k]),
              ))
          )
            return "出店申請に紐づく予約は、承認済みの申請と同じ内容にしてください。会場・日時の変更は出店申請から行ってください";
        }
      }
      if (p === "shifts" && D.shiftConflict(state, r))
        return "スタッフの担当時間が重複しています";
    }
    if (p === "loans") {
      const err = D.validateQuantity(r.quantity);
      if (err) return err;
      const allowance = D.available(state, r.equipmentId, r.due, r.id);
      if (r.status !== "returned" && r.quantity > allowance)
        return "貸出可能数を超えています";
    }
    return "";
  }
  function bind(p) {
    if (fields[p]) {
      $("#add-row").onclick = () => openEditor(p);
      if (p === "groups")
        $("#group-filter").onchange = (e) => {
          groupFilter = e.target.value;
          render();
        };
      $("#search").oninput = (e) => {
        const pos = e.target.selectionStart;
        filterText = e.target.value;
        render();
        $("#search").focus();
        $("#search").setSelectionRange(pos, pos);
      };
      if ($("#status-filter"))
        $("#status-filter").onchange = (e) => {
          filterStatus = e.target.value;
          render();
        };
      $("#sort").onchange = (e) => {
        sortKey = e.target.value;
        render();
      };
      if ($("#loan-date"))
        $("#loan-date").onchange = (e) => {
          loanDate = e.target.value || today();
          render();
        };
      $("#export-csv").onclick = () =>
        download(
          p + ".csv",
          D.csv(
            state[p],
            fields[p].map((f) => f[0]),
          ),
          "text/csv",
        );
      document
        .querySelectorAll("[data-edit]")
        .forEach((b) => (b.onclick = () => openEditor(p, b.dataset.edit)));
      document.querySelectorAll("[data-delete]").forEach(
        (b) =>
          (b.onclick = () => {
            if (
              !confirm(
                p === "groups"
                  ? "この団体を一覧から外し、関連データとともに履歴として保存しますか？"
                  : "このデータを削除しますか？",
              )
            )
              return;
            if (p === "groups") {
              D.deleteGroup(state, b.dataset.delete);
              if (state.groupId === b.dataset.delete)
                state.groupId =
                  state.groups.find((g) => !g.archivedAt)?.id || "";
            } else state[p] = state[p].filter((r) => r.id !== b.dataset.delete);
            save(p === "groups" ? "団体を履歴へ移動しました" : pages[p][1] + "を削除しました");
            render();
          }),
      );
      document.querySelectorAll("[data-restore-group]").forEach(
        (b) =>
          (b.onclick = () => {
            D.restoreGroup(state, b.dataset.restoreGroup);
            save("団体を一覧に復元しました");
            render();
          }),
      );
      document.querySelectorAll("[data-approve]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!D.canApprove(state.role)) {
              toast("実行委員の操作です");
              return;
            }
            const a = state.applications.find(
              (x) => x.id === b.dataset.approve,
            );
            const err = D.validateTime(a);
            if (err) {
              toast(err);
              return;
            }
            if (D.venueConflict(state, a)) {
              toast("会場予約が重複しています");
              return;
            }
            if (!D.approve(state, b.dataset.approve)) {
              toast("実行委員のみ出店申請を承認できます");
              return;
            }
            save("出店を承認し、会場を予約しました");
            render();
          }),
      );
      document.querySelectorAll("[data-reject]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!D.canApprove(state.role)) {
              toast("実行委員の操作です");
              return;
            }
            const a = state.applications.find(
              (x) => x.id === b.dataset.reject,
            );
            if (a?.status !== "submitted") {
              toast("承認待ちの申請のみ差し戻しできます");
              return;
            }
            const reason = prompt(
              "差し戻し理由を入力してください（団体に表示されます）",
            );
            if (reason === null) return;
            const err = D.reject(state, b.dataset.reject, reason);
            if (err) {
              toast(err);
              return;
            }
            save("出店申請を差し戻しました");
            render();
          }),
      );
      document.querySelectorAll("[data-cancel]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!confirm("出店を取り消しますか？")) return;
            D.cancelApplication(state, b.dataset.cancel);
            save("出店を取り消しました");
            render();
          }),
      );
      document.querySelectorAll("[data-return]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!D.returnLoan(state, b.dataset.return)) {
              toast("この貸出は返却済みか、返却できる状態ではありません");
              return;
            }
            save("返却を記録しました");
            render();
          }),
      );
      document.querySelectorAll("[data-done]").forEach(
        (b) =>
          (b.onclick = () => {
            state.tasks.find((t) => t.id === b.dataset.done).status = "done";
            save("タスクを完了しました");
            render();
          }),
      );
    }
    if (p === "settings") {
      $("#backup").onclick = () =>
        download(
          "festival-backup-" + today() + ".json",
          JSON.stringify(state, null, 2),
        );
      $("#restore").onclick = async () => {
        const file = $("#restore-file").files[0];
        if (!file) {
          toast("ファイルを選んでください");
          return;
        }
        try {
          const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
          if (!D.validateImport(data))
            throw Error("形式が不正です");
          if (!confirm("現在のデータを置き換えますか？")) return;
          const restored = structuredClone(data);
          restored.activity.unshift({
            at: new Date().toISOString(),
            message: "バックアップを復元しました",
          });
          restored.activity = restored.activity.slice(0, 100);
          const serialized = JSON.stringify(restored);
          localStorage.setItem(KEY, serialized);
          state = restored;
          lastSavedState = serialized;
          storageWarning = "";
          toast("保存完了：バックアップを復元しました");
          render();
        } catch (e) {
          toast("バックアップを復元できませんでした。現在のデータは変更されていません。 " + e.message);
        }
      };
      $("#reset").onclick = () => {
        if (!confirm("編集内容を破棄し、初期データへ戻しますか？")) return;
        state = structuredClone(FestivalSeed);
        storageWarning = "";
        save("初期データへ戻しました");
        render();
      };
      $("#current-group").onchange = (e) => {
        state.groupId = e.target.value;
        if (!save("操作する団体を変更しました")) render();
      };
    }
  }
  $("#edit-form").addEventListener("input", (e) => {
    if (editing?.original && e.target.name && editing.p !== "expenses")
      editing.row[e.target.name] =
        e.target.type === "number" ? Number(e.target.value) : e.target.value;
  });
  $("#edit-form").onsubmit = (e) => {
    e.preventDefault();
    const { p, id } = editing;
    const r = {
      ...(editing.row || {}),
      ...Object.fromEntries(new FormData(e.target)),
    };
    fields[p]
      .filter((f) => f[2] === "number")
      .forEach((f) => (r[f[0]] = Number(r[f[0]])));
    r.id = id || D.nextId(state[p], prefixes[p]);
    const error = validate(p, r);
    if (error) {
      toast(error);
      return;
    }
    if (p === "expenses") r.amount = D.amountValue(r.amount);
    const reapproval =
      p === "applications" && id
        ? D.applyApplicationEdit(state, editing.original, r)
        : false;
    if (id) state[p][state[p].findIndex((x) => x.id === id)] = r;
    else state[p].push(r);
    if (
      !save(
        reapproval
          ? "重要項目が変更されたため、再承認待ちにしました（会場予約は再承認まで取消）"
          : pages[p][1] + "を保存しました",
      )
    ) {
      editing.saveFailed = true;
      hasUnsavedChanges = true;
      $("#form-status").textContent = saveError;
      return;
    }
    if (p === "groups" && !id) {
      groupFilter = "active";
      filterText = "";
      filterStatus = "";
    }
    $("#editor").close();
    render();
  };
  function closeEditor() {
    if (
      editing?.saveFailed &&
      !confirm("保存できていない入力があります。閉じると失われます。閉じますか？")
    )
      return;
    hasUnsavedChanges = false;
    $("#editor").close();
    editing = null;
    render();
  }
  $("#close-dialog").onclick = closeEditor;
  $("#cancel-dialog").onclick = closeEditor;
  $("#editor").addEventListener("cancel", (e) => {
    if (
      editing?.saveFailed &&
      !confirm("保存できていない入力があります。閉じると失われます。閉じますか？")
    ) {
      e.preventDefault();
      return;
    }
    hasUnsavedChanges = false;
    editing = null;
    setTimeout(render, 0);
  });
  $("#role").onchange = (e) => {
    state.role = e.target.value;
    save("操作する役割を変更しました");
    render();
  };
  window.addEventListener("hashchange", () => {
    filterText = "";
    filterStatus = "";
    sortKey = "id";
    render();
  });
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedChanges) return;
    e.preventDefault();
    e.returnValue = "";
  });
  render();
})();
