const state = { data: null, filter: "全部" };

const $ = (selector) => document.querySelector(selector);
const create = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { month: "今天", day: "--" };
  return {
    month: new Intl.DateTimeFormat("zh-CN", { month: "long" }).format(date),
    day: new Intl.DateTimeFormat("zh-CN", { day: "2-digit" }).format(date),
  };
}

function renderOverview(items = []) {
  const list = $("#overviewList");
  list.replaceChildren(...items.map((item) => create("li", "", item)));
}

function renderEvents(items = []) {
  const grid = $("#eventsGrid");
  const template = $("#eventTemplate");
  const cards = items.map((item) => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.category = item.category;
    card.querySelector(".category").textContent = item.category;
    card.querySelector(".status").textContent = item.status || "已核验";
    card.querySelector("h3").textContent = item.title;
    card.querySelector(".summary").textContent = item.summary;
    card.querySelector(".why").textContent = item.why;
    card.querySelector(".uncertainty").textContent = item.uncertainty || "暂无";
    const links = (item.sources || []).map((source, index) => {
      const link = create("a", "source-link", source.name || `来源 ${index + 1}`);
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    });
    if (!links.length) links.push(create("span", "empty-note", "首期更新后显示来源"));
    card.querySelector(".sources").replaceChildren(...links);
    return card;
  });
  grid.replaceChildren(...cards);
  applyFilter();
}

function renderSocial(items = []) {
  const nodes = items.map((item) => {
    const row = create("article", "social-item");
    row.append(
      create("span", "social-rank", String(item.rank).padStart(2, "0")),
      create("h3", "social-topic", item.topic),
      create("span", "social-where", item.where),
      create("span", "social-context", item.context),
      create("span", "confidence", item.confidence),
    );
    return row;
  });
  $("#socialList").replaceChildren(...nodes);
}

function renderWatchlist(items = []) {
  $("#watchList").replaceChildren(...items.map((item) => create("li", "", item)));
}

function renderReads(items = []) {
  const container = $("#deepReads");
  if (!items.length) {
    container.replaceChildren(create("p", "empty-note", "首期更新后显示三篇延伸阅读。"));
    return;
  }
  const links = items.map((item) => {
    const link = create("a", "deep-read");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(create("strong", "", item.title), create("span", "", item.reason));
    return link;
  });
  container.replaceChildren(...links);
}

function applyFilter() {
  document.querySelectorAll(".event-card").forEach((card) => {
    const matches = state.filter === "全部" || card.dataset.category === state.filter;
    card.hidden = !matches;
  });
}

function render(data) {
  state.data = data;
  const date = formatDate(data.date);
  $("#dateMonth").textContent = date.month;
  $("#dateDay").textContent = date.day;
  $("#readTime").textContent = `${data.readMinutes || 20} 分钟阅读`;
  $("#edition").textContent = data.edition || "每日晨报";
  $("#updatedAt").textContent = `更新于 ${data.updatedAt}`;
  renderOverview(data.overview);
  renderEvents(data.events);
  renderSocial(data.social);
  renderWatchlist(data.watchlist);
  renderReads(data.deepReads);
}

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    applyFilter();
  });
});

fetch(`./briefing.json?v=${Date.now()}`, { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("briefing unavailable");
    return response.json();
  })
  .then(render)
  .catch(() => {
    $("#updatedAt").textContent = "内容暂时无法读取";
    $("#eventsGrid").replaceChildren(create("p", "empty-note", "请稍后刷新页面。"));
  });
