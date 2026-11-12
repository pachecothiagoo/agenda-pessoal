const pad = (value) => String(value).padStart(2, "0");

export function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromISO(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  return localISODate(dateFromISO(value)) === value;
}

export function addDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

export function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

export function dayDistance(dateString) {
  const target = dateFromISO(dateString);
  const today = new Date();
  const targetUTC = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetUTC - todayUTC) / 86400000);
}

export function formatDate(dateString, options = { weekday: "short", day: "numeric", month: "short" }) {
  if (!isISODate(dateString)) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", options).format(dateFromISO(dateString));
}

export function monthTitle(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

export function alertInfo(dateString) {
  const days = dayDistance(dateString);
  if (days < 0) return { days, label: `${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"} vencido`, tone: "rose" };
  if (days === 0) return { days, label: "Hoje", tone: "rose" };
  if (days === 1) return { days, label: "Amanhã", tone: "rose" };
  if (days <= 2) return { days, label: `Em ${days} dias`, tone: "rose" };
  if (days <= 7) return { days, label: days === 7 ? "Falta 1 semana" : `Em ${days} dias`, tone: "orange" };
  if (days <= 14) return { days, label: days === 14 ? "Faltam 2 semanas" : `Em ${days} dias`, tone: "orange" };
  if (days <= 30) return { days, label: days === 30 ? "Falta 1 mês" : `Em ${days} dias`, tone: "amber" };
  return null;
}

export function parseQuickEntry(input, now = new Date()) {
  let text = String(input || "").trim();
  if (!text) return null;
  let date = null;
  const relative = /(depois de amanh[ãa]|amanh[ãa]|hoje)/i.exec(text);
  if (relative) {
    const phrase = relative[1].toLocaleLowerCase("pt-BR");
    const offset = phrase.startsWith("depois") ? 2 : phrase.startsWith("amanh") ? 1 : 0;
    date = addDays(now, offset);
    text = text.replace(relative[0], " ");
  } else {
    let match = /\bdia\s+(\d{1,2})(?:[\/.-](\d{1,2}))?(?:[\/.-](\d{2,4}))?\b/i.exec(text);
    let hasDayPrefix = Boolean(match);
    if (!match) match = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/.exec(text);
    if (match) {
      const day = Number(match[1]);
      let month = match[2] ? Number(match[2]) : now.getMonth() + 1;
      let year = match[3] ? Number(match[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
      if (!match[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        if (hasDayPrefix && !match[2]) date = new Date(now.getFullYear(), now.getMonth() + 1, day);
        else date.setFullYear(date.getFullYear() + 1);
      }
      text = text.replace(match[0], " ");
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null;

  const timeMatch = /\b(?:às?\s*)?(\d{1,2})(?:\s*(?:h|hr|hrs|:)(\d{2})?)\b/i.exec(text);
  let time = "";
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    if (hour > 23 || minute > 59) return null;
    time = `${pad(hour)}:${pad(minute)}`;
    text = text.replace(timeMatch[0], " ");
  }
  const title = text
    .replace(/\b(tenho|temos|marcar|agendar|compromisso)\b/gi, " ")
    .replace(/(^|\s)às(?=\s|$)/gi, " ")
    .replace(/[,:;.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title: title || "Compromisso", date: localISODate(date), time, duration: 60, category: "Pessoal", notes: "" };
}
