import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import { isISODate } from "./dates.js";

const eventCollection = (uid) => collection(db, "users", uid, "events");

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
  };
}

export function createEvent(uid, event) {
  return addDoc(eventCollection(uid), {
    ...validateEvent(event),
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
  return updateDoc(doc(db, "users", uid, "events", id), { ...safeUpdates, updatedAt: serverTimestamp() });
}

export function removeEvent(uid, id) {
  return deleteDoc(doc(db, "users", uid, "events", id));
}
