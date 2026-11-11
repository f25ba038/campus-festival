(function () {
  "use strict";
  const content = document.querySelector("#sponsors");
  const esc = (value) =>
    String(value ?? "").replace(
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
  function website(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    try {
      const url = new URL(text);
      if (url.protocol === "http:" || url.protocol === "https:")
        return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    return esc(text);
  }
  try {
    const saved = localStorage.getItem("campus-festival-v1");
    const state = saved ? JSON.parse(saved) : FestivalSeed;
    const sponsors =
      state && Array.isArray(state.sponsors)
        ? state.sponsors
        : state && state.sponsors === undefined
          ? FestivalSeed.sponsors
          : null;
    if (!sponsors) throw new Error("協賛データの形式が不正です");
    const rows = FestivalDomain.publicSponsors(sponsors);
    content.innerHTML = rows.length
      ? rows
          .map(
            (sponsor) =>
              `<article class="sponsor-card"><h2>${esc(sponsor.name)}</h2>${sponsor.description ? `<p>${esc(sponsor.description)}</p>` : ""}${sponsor.website ? `<div>${website(sponsor.website)}</div>` : ""}</article>`,
          )
          .join("")
      : '<p class="empty">現在ご紹介できる協賛先はありません。</p>';
  } catch (error) {
    content.textContent =
      "協賛情報を表示できませんでした。内部管理画面でデータを確認してください。";
    console.error(error);
  }
})();
