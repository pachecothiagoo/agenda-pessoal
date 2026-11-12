const pad = (n) => String(n).padStart(2, "0");
export function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function addDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}
export function dayDistance(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / 86400000);
}
export function formatDate(dateString, options = { weekday: "short", day: "numeric", month: "short" }) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", options).format(new Date(year, month - 1, day));
}
export function alertInfo(dateString) {
  const days = dayDistance(dateString);
  if (days < 0) return { days, label: `${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"} vencido`, tone: "rose", rank: 0 };
  if (days === 0) return { days, label: "É hoje", tone: "rose", rank: 1 };
  if (days === 1) return { days, label: "Amanhã", tone: "rose", rank: 2 };
  if (days <= 2) return { days, label: `Em ${days} dias`, tone: "rose", rank: 3 };
  if (days <= 7) return { days, label: days === 7 ? "Falta 1 semana" : `Em ${days} dias`, tone: "orange", rank: 4 };
  if (days <= 14) return { days, label: days === 14 ? "Faltam 2 semanas" : `Em ${days} dias`, tone: "orange", rank: 5 };
  if (days <= 30) return { days, label: days === 30 ? "Falta 1 mês" : `Em ${days} dias`, tone: "amber", rank: 6 };
  return null;
}

// Parser intencionalmente simples: suporta hoje/amanhã/depois de amanhã e datas D/M[/AAAA].
// Retorna null quando não encontra uma data inequívoca, sem inventar um dia.
export function parseQuickEntry(input) {
  const text = input.trim();
  if (!text) return null;
  const now = new Date();
  let date = null;
  let match;
  const relative = /(depois de amanh[ãa]|amanh[ãa]|hoje)/i.exec(text);
  if (relative) {
    const phrase = relative[1].toLocaleLowerCase("pt-BR");
    const offset = phrase.startsWith("depois") ? 2 : phrase.startsWith("amanh") ? 1 : 0;
    date = addDays(now, offset);
    text = text.replace(relative[0], " ");
  } else {
    match = /\bdia\s+(\d{1,2})(?:[\/.-](\d{1,2}))?(?:[\/.-](\d{2,4}))?\b/i.exec(text)
      || /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/.exec(text);
    if (match) {
      // `dia 14` usa o mês atual; se a data já passou, assume o próximo mês.
      const hasDayPrefix = /^dia/i.test(match[0]);
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
  if (!date) return null;
  const timeMatch = /\b(?:às?\s*)?(\d{1,2})(?:\s*(?:h|hr|hrs|:)(\d{2})?)\b/i.exec(text);
  let time = "";
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    if (hour > 23 || minute > 59) return null;
    time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    text = text.replace(timeMatch[0], " ");
  }
  const title = text.replace(/\b(tenho|temos|marcar|agendar|compromisso)\b/gi, " ")
    .replace(/[,:;.!?]+/g, " ").replace(/\s+/g, " ").trim();
  return { title: title || "Compromisso", date: localISODate(date), time };
}
