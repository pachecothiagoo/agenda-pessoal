const ALERTS_ENABLED_KEY = (uid) => `raiz-local-alerts-${uid}`;
const MAX_ALERT_AGE_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 1000;
const shownAlerts = new Set();
let audioContext = null;
let audioUnlocked = false;
let currentUid = null;
let currentEvents = [];
let checkTimer = null;

function getAlertStorageKey(uid, event, kind, scheduledAt) {
  return `raiz-alert-shown:${uid}:${event.id}:${kind}:${scheduledAt}`;
}

function wasAlertShown(key) {
  try {
    return localStorage.getItem(key) === "true" || shownAlerts.has(key);
  } catch {
    return shownAlerts.has(key);
  }
}

function markAlertShown(key) {
  shownAlerts.add(key);
  try {
    localStorage.setItem(key, "true");
  } catch {
    // A memória da aba ainda impede alertas repetidos nesta sessão.
  }
}

function eventDateTime(event) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date || "")) return null;
  const [year, month, day] = event.date.split("-").map(Number);
  const [hour, minute] = (event.time || "09:00").split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute || 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unlockAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext ||= new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume();
    audioUnlocked = true;
  } catch (error) {
    console.warn("Não foi possível ativar o som dos avisos:", error);
  }
}

document.addEventListener("pointerdown", unlockAudio);
document.addEventListener("keydown", unlockAudio);

function playReminderSound() {
  if (!audioContext || !audioUnlocked || audioContext.state !== "running") return;

  const start = audioContext.currentTime + 0.02;
  const notes = [659.25, 783.99, 987.77, 783.99, 659.25];
  notes.forEach((frequency, index) => {
    const noteStart = start + index * 1.05;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.075, noteStart + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.82);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.85);
  });
}

export async function activateLocalReminders(uid) {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }

  unlockAudio();
  try {
    localStorage.setItem(ALERTS_ENABLED_KEY(uid), "true");
  } catch {
    throw new Error("O navegador bloqueou o armazenamento da ativação. Permita dados do site e tente novamente.");
  }
}

function showReminderCard(event, kind, minutesBefore, scheduledAt) {
  const key = getAlertStorageKey(currentUid, event, kind, scheduledAt);
  if (wasAlertShown(key)) return;
  markAlertShown(key);

  const region = document.querySelector("#reminder-region");
  if (!region) return;

  const card = document.createElement("article");
  card.className = "reminder-card";
  card.setAttribute("role", "alert");
  card.setAttribute("aria-live", "assertive");
  const heading = kind === "start"
    ? "Seu compromisso começou"
    : minutesBefore >= 1440
      ? "Falta 1 dia"
      : minutesBefore >= 60
        ? `Falta ${minutesBefore / 60} hora${minutesBefore === 60 ? "" : "s"}`
        : `Faltam ${minutesBefore} minutos`;

  const title = document.createElement("strong");
  title.className = "reminder-card-heading";
  title.textContent = heading;
  const close = document.createElement("button");
  close.className = "reminder-card-close";
  close.type = "button";
  close.setAttribute("aria-label", "Fechar aviso");
  close.textContent = "×";
  const eventTitle = document.createElement("span");
  eventTitle.className = "reminder-card-title";
  eventTitle.textContent = event.title;
  const detail = document.createElement("span");
  detail.className = "reminder-card-detail";
  detail.textContent = `${event.time || "09:00"} · Este aviso fecha em 5 minutos`;

  const dismiss = () => {
    window.clearTimeout(timeout);
    card.classList.add("is-leaving");
    window.setTimeout(() => card.remove(), 180);
  };
  close.addEventListener("click", dismiss);
  card.append(close, title, eventTitle, detail);
  region.append(card);
  const timeout = window.setTimeout(dismiss, MAX_ALERT_AGE_MS);
  playReminderSound();
}

function checkReminders() {
  if (!currentUid || document.visibilityState !== "visible") return;
  try {
    if (localStorage.getItem(ALERTS_ENABLED_KEY(currentUid)) !== "true") return;
  } catch {
    return;
  }
  const now = Date.now();
  for (const event of currentEvents) {
    if (event.done) continue;
    const start = eventDateTime(event);
    if (!start) continue;

    const reminderMinutes = Number(event.reminderMinutes ?? 10);
    const reminderAt = start.getTime() - reminderMinutes * 60_000;
    if (reminderMinutes > 0 && now >= reminderAt && now - reminderAt < MAX_ALERT_AGE_MS) {
      showReminderCard(event, "reminder", reminderMinutes, reminderAt);
    }
    if (now >= start.getTime() && now - start.getTime() < MAX_ALERT_AGE_MS) {
      showReminderCard(event, "start", 0, start.getTime());
    }
  }
}

export function setReminderEvents(uid, events) {
  currentUid = uid;
  currentEvents = events || [];
  checkReminders();
  if (!checkTimer) checkTimer = window.setInterval(checkReminders, CHECK_INTERVAL_MS);
}

export function stopReminderChecks() {
  currentUid = null;
  currentEvents = [];
  if (checkTimer) window.clearInterval(checkTimer);
  checkTimer = null;
}

document.addEventListener("visibilitychange", checkReminders);
