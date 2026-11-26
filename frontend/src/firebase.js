// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, forceLongPolling } from "firebase/database";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyDaIDuVITYpH0pzkqaiDaFHORy70YqDFGM",
  authDomain: "test-5b6ed.firebaseapp.com",
  databaseURL: "https://test-5b6ed-default-rtdb.firebaseio.com",
  projectId: "test-5b6ed",
  storageBucket: "test-5b6ed.firebasestorage.app",
  messagingSenderId: "681058995284",
  appId: "1:681058995284:web:b78f5bdb308c12f3e9f1c1",
  measurementId: "G-Y5L1Z63Y5B"
};

// Some phones / networks block Firebase's websocket connection, so the menu never loads.
// Long polling uses plain HTTPS requests instead. It must be called before the database is first used.
forceLongPolling();

const app = initializeApp(firebaseConfig);

// App Check: auth / database භාවිතයට පෙර initialize කළ යුතුයි
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (siteKey) {
  if (import.meta.env.DEV) {
    // localhost: console හි debug token එකක් print වේ
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = getDatabase(app);