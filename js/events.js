import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";

const eventsCollection = (uid) => collection(db, "users", uid, "events");
export function watchEvents(uid, onData, onError) {
  return onSnapshot(query(eventsCollection(uid), orderBy("date", "asc")), (snapshot) => {
    onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}
export function createEvent(uid, event) {
  return addDoc(eventsCollection(uid), { ...event, done: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export function changeEvent(uid, id, updates) {
  return updateDoc(doc(db, "users", uid, "events", id), { ...updates, updatedAt: serverTimestamp() });
}
export function removeEvent(uid, id) {
  return deleteDoc(doc(db, "users", uid, "events", id));
}
