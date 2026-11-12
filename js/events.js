import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { isISODate } from "./dates.js";

const eventCollection = (uid) => collection(db, "users", uid, "events");
const reminderOptions = [0, 5, 10, 15, 30, 60, 1440];

function makeReminderTimes(event) {
  const [year, month, day] = event.date.split("-").map(Number);
  const [hour, minute] = (event.time || "09:00").split(":").map(Number);
  const eventDate = new Date(year, month - 1, day, hour, minute || 0, 0, 0);
  const reminderMinutes = Number(event.reminderMinutes ?? 10);
  if (!Number.isInteger(reminderMinutes) || !reminderOptions.includes(reminderMinutes)) {
    throw new Error("Escolha um prazo de lembrete válido.");
  }
  const reminderDate = new Date(eventDate.getTime() - reminderMinutes * 60_000);
  return {
    reminderMinutes,
    eventAt: Timestamp.fromDate(eventDate),
    reminderAt: Timestamp.fromDate(reminderDate),
    reminderSentAt: null,
    reminderClaimedAt: null,
  };
}

export function watchEvents(uid, onData, onError) {
  const eventsQuery = query(eventCollection(uid), orderBy("date", "asc"));
  return onSnapshot(eventsQuery, (snapshot) => {
    const items = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
    onData(items);
  }, onError);
}

function validateEvent(event) {
  if (!event || typeof event.title !== "string" || !event.title.trim() || event.title.trim().length > 160) {
    throw new Error("Informe um título de até 160 caracteres.");
  }
  if (!isISODate(event.date)) throw new Error("Escolha uma data válida.");
  if (typeof event.time !== "string" || (event.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time))) {
    throw new Error("Informe um horário válido.");
  }
  const duration = Number(event.duration ?? 60);
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) throw new Error("A duração deve estar entre 15 minutos e 8 horas.");
  if (typeof (event.category ?? "Pessoal") !== "string" || String(event.category ?? "Pessoal").length > 40) {
    throw new Error("Escolha uma categoria válida.");
  }
  if (typeof (event.notes ?? "") !== "string" || String(event.notes ?? "").length > 1000) throw new Error("As observações podem ter no máximo 1.000 caracteres.");
  return {
    title: event.title.trim(),
    date: event.date,
    time: event.time || "",
    duration,
    category: event.category || "Pessoal",
    notes: event.notes || "",
    reminderMinutes: Number(event.reminderMinutes ?? 10),
  };
}

export function createEvent(uid, event) {
  return addDoc(eventCollection(uid), {
    ...validateEvent(event),
    ...makeReminderTimes(event),
    done: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function changeEvent(uid, id, updates) {
  const safeUpdates = { ...updates };
  if ("title" in safeUpdates || "date" in safeUpdates || "time" in safeUpdates || "duration" in safeUpdates || "category" in safeUpdates || "notes" in safeUpdates) {
    const current = safeUpdates;
    if (current.title !== undefined && (!String(current.title).trim() || String(current.title).length > 160)) throw new Error("Informe um título de até 160 caracteres.");
    if (current.date !== undefined && !isISODate(current.date)) throw new Error("Escolha uma data válida.");
    if (current.time !== undefined && current.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(current.time)) throw new Error("Informe um horário válido.");
    if (current.duration !== undefined && (!Number.isInteger(Number(current.duration)) || Number(current.duration) < 15 || Number(current.duration) > 480)) throw new Error("A duração deve estar entre 15 minutos e 8 horas.");
    if (current.category !== undefined && (typeof current.category !== "string" || current.category.length > 40)) throw new Error("Escolha uma categoria válida.");
    if (current.notes !== undefined && (typeof current.notes !== "string" || current.notes.length > 1000)) throw new Error("As observações podem ter no máximo 1.000 caracteres.");
  }
  const reference = doc(db, "users", uid, "events", id);
  return (async () => {
    const scheduleChanged = ["date", "time", "reminderMinutes"].some((field) => field in safeUpdates);
    if (scheduleChanged || safeUpdates.done === false) {
      const snapshot = await getDoc(reference);
      if (!snapshot.exists()) throw new Error("Esse compromisso não existe mais.");
      const merged = { ...snapshot.data(), ...safeUpdates };
      if (scheduleChanged || (!merged.reminderAt && !merged.done)) {
        Object.assign(safeUpdates, makeReminderTimes(merged));
      }
    }
    return updateDoc(reference, { ...safeUpdates, updatedAt: serverTimestamp() });
  })();
}

export async function backfillEventReminders(uid, items) {
  const migrationKey = `raiz-reminders-migrated-${uid}`;
  if (sessionStorage.getItem(migrationKey) === "done") return;
  sessionStorage.setItem(migrationKey, "done");
  const missing = items.filter((event) => !event.reminderAt);
  const results = await Promise.allSettled(missing.map((event) => {
    if (!isISODate(event.date)) return Promise.resolve();
    return changeEvent(uid, event.id, {
      date: event.date,
      time: event.time || "",
      reminderMinutes: Number(event.reminderMinutes ?? 10),
    });
  }));
  if (results.some((result) => result.status === "rejected")) sessionStorage.removeItem(migrationKey);
}

export function removeEvent(uid, id) {
  return deleteDoc(doc(db, "users", uid, "events", id));
}
