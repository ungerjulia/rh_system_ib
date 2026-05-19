import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyB_bxR23gMu_XxVzaFiXM5Cx_VJfJl9kO8",
  authDomain: "rh-system-ib-818fc.firebaseapp.com",
  projectId: "rh-system-ib-818fc",
  storageBucket: "rh-system-ib-818fc.firebasestorage.app",
  messagingSenderId: "726154682179",
  appId: "1:726154682179:web:3426f38380966b0c4a59f6"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db   = getFirestore(app)

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ hd: "independentbrazil.com" }) // restringe ao domínio da empresa

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider)
export const logout          = () => signOut(auth)
