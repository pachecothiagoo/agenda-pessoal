// Substitua os valores pelas credenciais do Firebase Console > Configurações do projeto.
// apiKey identifica o projeto; autorização real é aplicada pelas regras do Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyACN6QzrruQrBSUPH18RjEgtsurABZKBzQ",
  authDomain: "agenda-pessoal-ef9df.firebaseapp.com",
  projectId: "agenda-pessoal-ef9df",
  storageBucket: "agenda-pessoal-ef9df.firebasestorage.app",
  messagingSenderId: "791815258913",
  appId: "1:791815258913:web:38bd3252e880387c743460",
  measurementId: "G-PPC22GYD97",
};

// Web Push VAPID: cole a chave pública gerada com `npx web-push generate-vapid-keys`.
// A chave privada deve ficar somente no Secret Manager do Firebase, nunca neste arquivo.
export const webPushPublicKey =
  "BE8AD3IifbLNbDo_vWVLbMczcg7spDhioRuMrS5ghUc2e1sg3jb3sADgWrUOfPdlWNOqrl9KvRNCN0z2J9LmP3s";
