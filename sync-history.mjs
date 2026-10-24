import { readFile, readdir, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const archiveDir = path.resolve(siteDir, "..", "morning-brief-archive");
const historyDir = path.join(siteDir, "history");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function shanghaiToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function cutoffDate(today) {
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 29);
  return day.toISOString().slice(0, 10);
}

function validateBrief(data) {
  const parsedDate = datePattern.test(data?.date) ? new Date(`${data.date}T00:00:00Z`) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== data.date) {
    throw new Error("晨报 date 必须是有效的 YYYY-MM-DD 日期");
  }
  if (typeof data.updatedAt !== "string" || !data.updatedAt.trim()) {
    throw new Error("晨报缺少 updatedAt");
  }
  for (const field of ["overview", "events", "social", "watchlist", "deepReads"]) {
    if (!Array.isArray(data[field])) throw new Error(`晨报缺少数组字段 ${field}`);
  }
}

async function atomicWrite(target, content) {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function newestSnapshot(folder) {
  const names = (await readdir(folder)).filter((name) => /^\d{4}-\d{2}-\d{2}T.*Z\.json$/.test(name)).sort();
  return names.length ? path.join(folder, names.at(-1)) : null;
}

async function main() {
  const source = path.join(siteDir, "briefing.json");
  const raw = await readFile(source, "utf8");
  const brief = JSON.parse(raw);
  validateBrief(brief);

  const today = shanghaiToday();
  if (brief.date > today) throw new Error(`晨报日期 ${brief.date} 晚于北京时间今天 ${today}`);

  const snapshotDir = path.join(archiveDir, brief.date);
  await mkdir(snapshotDir, { recursive: true });
  const previous = await newestSnapshot(snapshotDir);
  let savedSnapshot = false;
  if (!previous || (await readFile(previous, "utf8")) !== raw) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(path.join(snapshotDir, `${stamp}.json`), raw, { encoding: "utf8", flag: "wx" });
    savedSnapshot = true;
  }

  await mkdir(historyDir, { recursive: true });
  const publicBrief = path.join(historyDir, `${brief.date}.json`);
  if ((await readFile(publicBrief, "utf8").catch(() => null)) !== raw) {
    await atomicWrite(publicBrief, raw);
  }

  const cutoff = cutoffDate(today);
  const files = (await readdir(historyDir)).filter((name) => datePattern.test(name.slice(0, -5)) && name.endsWith(".json") && name !== "index.json");
  for (const name of files) {
    if (name.slice(0, 10) < cutoff || name.slice(0, 10) > today) {
      await unlink(path.join(historyDir, name));
    }
  }

  const dates = (await readdir(historyDir))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 10))
    .sort()
    .reverse();
  const manifest = JSON.stringify({ generatedAt: new Date().toISOString(), dates }, null, 2) + "\n";
  await atomicWrite(path.join(historyDir, "index.json"), manifest);
  process.stdout.write(`已同步 ${brief.date}；永久归档${savedSnapshot ? "新增快照" : "无变化"}；网页可选 ${dates.length} 天。\n`);
}

main().catch((error) => {
  process.stderr.write(`归档同步失败：${error.message}\n`);
  process.exitCode = 1;
});
