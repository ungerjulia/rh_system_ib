import { useState, useEffect, useRef } from "react"
import { listCandidates, addCandidates, deleteCandidate } from "../services/firestore"
import { processCandidate } from "../services/functions"

const REC = { FORTE:"forte", MODERADO:"moderado", FRACO:"fraco" }
const REC_LABEL = { FORTE:"Forte", MODERADO:"Moderado", FRACO:"Fraco" }

function ScoreBar({ value, max, color }) {
  return (
    <div className="bar-wrap">
      <div className="bar-track">
        <div className={`bar-fill ${color}`} style={{ width:`${Math.round((value/max)*100)}%` }} />
      </div>
      <span className="bar-val">{value}/{max}</span>
    </div>
  )
}

function CandidateCard({ c, rank, onDelete }) {
  const [open, setOpen] = useState(false)
  const col = REC[c.recommendation] || "gray"

  return (
    <div className={`cand-card ${open ? "expanded" : ""}`}>
      <div className="cand-row" onClick={() => c.status === "done" && setOpen(o => !o)}>
        <span className="rank">#{rank}</span>
        <div className="cand-info">
          <strong>{c.fullName || c.linkedinUrl?.split("/in/")[1]?.replace(/\/$/, "") || "—"}</strong>
          <span className="cand-hl">{c.headline || "—"}</span>
        </div>
        <div className="cand-right">
          {c.status === "done" ? (
            <>
              <span className="score-num">{c.scoreTotal}</span>
              <span className={`rec-badge ${col}`}>{REC_LABEL[c.recommendation]}</span>
            </>
          ) : c.status === "processing" ? (
            <span className="status-chip processing">⟳ Analisando</span>
          ) : c.status === "error" ? (
            <span className="status-chip error" title={c.errorMsg}>✕ Erro</span>
          ) : (
            <span className="status-chip pending">⋯ Aguardando</span>
          )}
          <button className="btn-icon danger sm"
            onClick={e => { e.stopPropagation(); onDelete(c.id) }}>✕</button>
          {c.status === "done" && (
            <span className={`chevron ${open ? "up" : ""}`}>▾</span>
          )}
        </div>
      </div>

      {open && c.status === "done" && (
        <div className="cand-detail">
          <p className="llm-summary">{c.summaryLlm}</p>
          <div className="crit-grid">
            <div className="crit"><span>Experiência</span><ScoreBar value={c.scoreExperience} max={25} color="blue" /></div>
            <div className="crit"><span>Habilidades</span><ScoreBar value={c.scoreSkills} max={25} color="blue" /></div>
            <div className="crit"><span>Formação</span><ScoreBar value={c.scoreEducation} max={20} color="teal" /></div>
            <div className="crit"><span>Idiomas</span><ScoreBar value={c.scoreLanguages} max={15} color="teal" /></div>
            <div className="crit"><span>Fit cultural</span><ScoreBar value={c.scoreCultural} max={15} color="purple" /></div>
          </div>
          <div className="tags-section">
            <div className="tags-row">
              <span className="tags-label green">✓ Pontos fortes</span>
              {(c.strengths || []).map((s, i) => <span key={i} className="tag green">{s}</span>)}
            </div>
            <div className="tags-row">
              <span className="tags-label amber">⚠ Atenção</span>
              {(c.concerns || []).map((s, i) => <span key={i} className="tag amber">{s}</span>)}
            </div>
          </div>
          <a className="li-link" href={c.linkedinUrl} target="_blank" rel="noreferrer">
            Ver perfil no LinkedIn ↗
          </a>
        </div>
      )}
    </div>
  )
}

export default function JobDetail({ job, onBack }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading]       = useState(true)
  const [urls, setUrls]             = useState("")
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef(null)

  const load = async () => {
    try {
      const list = await listCandidates(job.id)
      list.sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return -1
        if (b.status === "done" && a.status !== "done") return 1
        return (b.scoreTotal || 0) - (a.scoreTotal || 0)
      })
      setCandidates(list)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 5000)
    return () => clearInterval(pollRef.current)
  }, [])

  useEffect(() => {
    const allDone = candidates.length > 0 &&
      candidates.every(c => ["done", "error"].includes(c.status))
    if (allDone) clearInterval(pollRef.current)
  }, [candidates])

  const submit = async () => {
    const list = urls.split("\n").map(u => u.trim()).filter(Boolean)
    if (!list.length) return
    setSubmitting(true)
    try {
      const ids = await addCandidates(job.id, list)
      setUrls("")
      await load()
      clearInterval(pollRef.current)
      pollRef.current = setInterval(load, 5000)
      // Dispara processamento de cada candidato novo
      for (const id of ids) {
        processCandidate(job.id, id).catch(console.error)
        await new Promise(r => setTimeout(r, 300))
      }
    } catch(e) { alert("Erro ao enviar URLs") }
    setSubmitting(false)
  }

  const del = async (id) => {
    if (!confirm("Remover este candidato?")) return
    await deleteCandidate(job.id, id)
    setCandidates(c => c.filter(x => x.id !== id))
  }

  const exportCsv = () => {
    const done = candidates.filter(c => c.status === "done")
    const rows = [
      ["rank","nome","titulo","score","recomendacao","experiencia","habilidades","formacao","idiomas","fit_cultural","pontos_fortes","pontos_atencao","resumo","url"],
      ...done.map((c, i) => [
        i+1, c.fullName, c.headline, c.scoreTotal, c.recommendation,
        c.scoreExperience, c.scoreSkills, c.scoreEducation, c.scoreLanguages, c.scoreCultural,
        (c.strengths||[]).join(" | "), (c.concerns||[]).join(" | "), c.summaryLlm, c.linkedinUrl
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8" }))
    a.download = `ranking_${job.title.replace(/\s+/g,"_")}.csv`
    a.click()
  }

  const processing = candidates.filter(c => ["pending","processing"].includes(c.status)).length
  const done       = candidates.filter(c => c.status === "done").length
  const urlCount   = urls.split("\n").filter(u => u.trim()).length

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn-ghost back" onClick={onBack}>← Voltar</button>
        <div className="job-title-header">
          <span className="logo-dot" />
          <span>{job.title}</span>
        </div>
        {done > 0 && (
          <button className="btn-outline" onClick={exportCsv}>↓ Exportar CSV</button>
        )}
      </header>

      <main className="container">
        <div className="submit-box">
          <label>Cole as URLs dos perfis LinkedIn — uma por linha
            <textarea rows={4} value={urls} onChange={e => setUrls(e.target.value)}
              placeholder={"https://www.linkedin.com/in/candidato-1/\nhttps://www.linkedin.com/in/candidato-2/"} />
          </label>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10 }}>
            <span style={{ fontSize:12, color:"#555a6e" }}>
              {urlCount > 0 ? `${urlCount} URL${urlCount > 1 ? "s" : ""} detectada${urlCount > 1 ? "s" : ""}` : "Cole quantas URLs quiser"}
            </span>
            <button className="btn-primary" onClick={submit}
              disabled={submitting || urlCount === 0}>
              {submitting ? "Enviando…" : "Analisar candidatos"}
            </button>
          </div>
        </div>

        {processing > 0 && (
          <div className="processing-banner">
            <span className="spinner" />
            Analisando {processing} candidato{processing > 1 ? "s" : ""}…
          </div>
        )}

        {loading ? (
          <div className="jobs-grid">
            {[1,2].map(i => <div key={i} className="card skeleton tall" />)}
          </div>
        ) : candidates.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">◎</span>
            <p>Nenhum candidato ainda. Cole URLs acima para começar.</p>
          </div>
        ) : (
          <div className="cand-list">
            <div className="list-meta">
              {candidates.length} candidato{candidates.length > 1 ? "s" : ""} · {done} avaliado{done !== 1 ? "s" : ""}
            </div>
            {candidates.map((c, i) => (
              <CandidateCard key={c.id} c={c} rank={i+1} onDelete={del} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
