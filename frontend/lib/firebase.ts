import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  type Auth,
} from "firebase/auth";

// Local-only fallback so `npm run dev` works with zero configuration.
// These demo values address the Auth Emulator, never a real project.
const DEMO_CONFIG = {
  apiKey: "demo-api-key",
  authDomain: "localhost",
  projectId: "demo-apun-ghar",
  appId: "demo-app-id",
};

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || DEMO_CONFIG.apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || DEMO_CONFIG.authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || DEMO_CONFIG.projectId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || DEMO_CONFIG.appId,
  };
}

let firebaseApp: FirebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig());
} else {
  firebaseApp = getApps()[0];
}

export const auth: Auth = getAuth(firebaseApp);

/** Prepared for Slice 3B-2 login UI. No UI uses it yet. */
export const googleProvider = new GoogleAuthProvider();

const emulatorHost =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const useEmulator = (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR ?? "true") !== "false";

if (useEmulator && typeof window !== "undefined" && !auth.emulatorConfig) {
  connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
}
