import {
  collection, doc, addDoc, getDocs, getDoc,
  deleteDoc, updateDoc, query, orderBy, serverTimestamp
} from "firebase/firestore"
import { db } from "../firebase"

// ── JOBS ──────────────────────────────────────────────────────────────────────

export async function listJobs() {
  const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"))
  const snap = await getDocs(q)
  const jobs = []
  for (const d of snap.docs) {
    const data = { id: d.id, ...d.data() }
    // Conta candidatos
    const cSnap = await getDocs(collection(db, "jobs", d.id, "candidates"))
    data.totalCandidates = cSnap.size
    data.doneCandidates  = cSnap.docs.filter(c => c.data().status === "done").length
    jobs.push(data)
  }
  return jobs
}

export async function createJob(title, description) {
  const ref = await addDoc(collection(db, "jobs"), {
    title,
    description,
    createdAt: serverTimestamp()
  })
  return ref.id
}

export async function deleteJob(jobId) {
  // Deleta candidatos primeiro
  const cSnap = await getDocs(collection(db, "jobs", jobId, "candidates"))
  for (const c of cSnap.docs) await deleteDoc(c.ref)
  await deleteDoc(doc(db, "jobs", jobId))
}

// ── CANDIDATES ────────────────────────────────────────────────────────────────

export async function listCandidates(jobId) {
  const q = query(
    collection(db, "jobs", jobId, "candidates"),
    orderBy("scoreTotal", "desc")
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addCandidates(jobId, urls) {
  // Verifica URLs já existentes
  const existing = await getDocs(collection(db, "jobs", jobId, "candidates"))
  const existingUrls = new Set(existing.docs.map(d => d.data().linkedinUrl))

  const created = []
  for (const url of urls) {
    const u = url.trim()
    if (!u || existingUrls.has(u)) continue
    const ref = await addDoc(collection(db, "jobs", jobId, "candidates"), {
      linkedinUrl: url,
      status: "pending",
      scoreTotal: 0,
      createdAt: serverTimestamp()
    })
    created.push(ref.id)
    existingUrls.add(u)
  }
  return created
}

export async function deleteCandidate(jobId, candidateId) {
  await deleteDoc(doc(db, "jobs", jobId, "candidates", candidateId))
}

export async function updateCandidate(jobId, candidateId, data) {
  await updateDoc(doc(db, "jobs", jobId, "candidates", candidateId), data)
}

export async function getJob(jobId) {
  const d = await getDoc(doc(db, "jobs", jobId))
  return d.exists() ? { id: d.id, ...d.data() } : null
}
