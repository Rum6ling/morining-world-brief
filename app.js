const state = { data: null, filter: "全部", dates: [], latestDate: null, requestId: 0 };

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

function shanghaiToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function oldestVisibleDate() {
  const cutoff = new Date(`${shanghaiToday()}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  return cutoff.toISOString().slice(0, 10);
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
    const category = card.dataset.category || "";
    const matches = state.filter === "全部" ||
      (state.filter === "世界" ? /世界|国际/.test(category) : category.includes(state.filter));
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
  $("#page-title").textContent = data.date === shanghaiToday()
    ? "今天，先读这 20 分钟"
    : `${data.date} 的世界晨报`;
  document.title = `${data.date} · 晨界世界晨报`;
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

async function fetchJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`无法读取 ${url}`);
  return response.json();
}

async function selectDate(date) {
  const requestId = ++state.requestId;
  const selector = $("#historyDateSelect");
  selector.disabled = true;
  $("#archiveStatus").textContent = "";
  try {
    const data = await fetchJson(`./history/${date}.json`);
    if (requestId !== state.requestId) return;
    if (data.date !== date) throw new Error("所选日期与晨报内容不符");
    render(data);
    selector.value = date;
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url);
  } catch {
    if (requestId === state.requestId) {
      $("#archiveStatus").textContent = "这一天的晨报暂时无法读取，请稍后重试。";
      if (!state.data) $("#eventsGrid").replaceChildren(create("p", "empty-note", "请稍后刷新页面。"));
    }
  } finally {
    if (requestId === state.requestId) selector.disabled = false;
  }
}

async function initializeHistory() {
  const selector = $("#historyDateSelect");
  try {
    const manifest = await fetchJson("./history/index.json");
    const today = shanghaiToday();
    const cutoff = oldestVisibleDate();
    const dates = Array.isArray(manifest.dates) ? manifest.dates.filter((date) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= cutoff && date <= today) : [];
    if (!dates.length) throw new Error("暂无历史晨报");
    state.dates = [...new Set(dates)].sort().reverse();
    state.latestDate = state.dates[0];
    selector.replaceChildren(...state.dates.map((date) => {
      const option = create("option", "", date === state.latestDate ? `${date} · 最新` : date);
      option.value = date;
      return option;
    }));
    const requested = new URLSearchParams(window.location.search).get("date");
    await selectDate(state.dates.includes(requested) ? requested : state.latestDate);
  } catch {
    try {
      const current = await fetchJson("./briefing.json");
      state.latestDate = current.date;
      state.dates = [current.date];
      const option = create("option", "", `${current.date} · 最新`);
      option.value = current.date;
      selector.replaceChildren(option);
      render(current);
      $("#archiveStatus").textContent = "历史目录暂时无法读取，目前仅显示最新一期。";
    } catch {
      $("#updatedAt").textContent = "内容暂时无法读取";
      $("#eventsGrid").replaceChildren(create("p", "empty-note", "请稍后刷新页面。"));
      $("#archiveStatus").textContent = "晨报内容暂时无法读取。";
    }
  } finally {
    selector.disabled = false;
  }
}

$("#historyDateSelect").addEventListener("change", (event) => {
  const date = event.target.value;
  if (state.dates.includes(date)) selectDate(date);
});

initializeHistory();
