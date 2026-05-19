import { useState, useEffect } from "react"
import { listJobs, createJob, deleteJob } from "../services/firestore"
import { useAuth } from "../components/AuthProvider"

export default function JobList({ onSelect }) {
  const { user, logout }      = useAuth()
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [title, setTitle]     = useState("")
  const [desc, setDesc]       = useState("")
  const [saving, setSaving]   = useState(false)

  const load = async () => {
    setLoading(true)
    try { setJobs(await listJobs()) } catch(e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!title.trim() || !desc.trim()) return
    setSaving(true)
    try {
      await createJob(title.trim(), desc.trim())
      setModal(false); setTitle(""); setDesc("")
      await load()
    } catch(e) { alert("Erro ao criar vaga") }
    setSaving(false)
  }

  const del = async (e, id) => {
    e.stopPropagation()
    if (!confirm("Excluir esta vaga e todos os candidatos?")) return
    await deleteJob(id)
    setJobs(j => j.filter(x => x.id !== id))
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="logo">
          <span className="logo-dot" />
          <span className="logo-text">RH<em>Agent</em></span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={user.photoURL} alt="" style={{ width:28, height:28, borderRadius:"50%" }} />
          <button className="btn-ghost" onClick={logout}>Sair</button>
          <button className="btn-primary" onClick={() => setModal(true)}>+ Nova vaga</button>
        </div>
      </header>

      <main className="container">
        <div className="page-title">
          <h1>Vagas abertas</h1>
          <p>Selecione uma vaga para ver o ranking de candidatos</p>
        </div>

        {loading ? (
          <div className="jobs-grid">
            {[1,2,3].map(i => <div key={i} className="card skeleton" />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">◎</span>
            <p>Nenhuma vaga criada ainda</p>
            <button className="btn-primary" onClick={() => setModal(true)}>Criar primeira vaga</button>
          </div>
        ) : (
          <div className="jobs-grid">
            {jobs.map(j => (
              <div key={j.id} className="card job-card" onClick={() => onSelect(j)}>
                <div className="job-card-header">
                  <h2>{j.title}</h2>
                  <button className="btn-icon danger" onClick={e => del(e, j.id)}>✕</button>
                </div>
                <p className="job-desc">{j.description?.slice(0, 110)}…</p>
                <div className="job-stats">
                  <span className="stat"><strong>{j.totalCandidates}</strong> candidatos</span>
                  <span className="stat"><strong>{j.doneCandidates}</strong> avaliados</span>
                  {j.totalCandidates > 0 && (
                    <span className="progress-bar">
                      <span className="progress-fill"
                        style={{ width: `${Math.round((j.doneCandidates / j.totalCandidates) * 100)}%` }} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Nova vaga</h2>
            <label>Título
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Analista de Comércio Exterior Pleno" />
            </label>
            <label style={{ marginTop:16 }}>Descrição completa
              <textarea rows={10} value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="Cole aqui os requisitos, responsabilidades e diferenciais…" />
            </label>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={create} disabled={saving}>
                {saving ? "Criando…" : "Criar vaga"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
