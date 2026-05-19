import { auth } from "../firebase"

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL

async function call(path, body) {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

export const processCandidate = (jobId, candidateId) =>
  call("/process", { jobId, candidateId })
