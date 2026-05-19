"""
RH Agent — Cloud Functions
Backend: busca perfil (LinkdAPI) + scoring IA (Claude)
"""
import json
import os
import asyncio
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import firestore_async, auth
from firebase_functions import https_fn, options
from anthropic import AsyncAnthropic

# ── Lazy init ─────────────────────────────────────────────────────────────────
_db = None
_anthropic = None

def get_db():
    global _db
    if _db is None:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        _db = firestore_async.client()
    return _db

def get_anthropic():
    global _anthropic
    if _anthropic is None:
        _anthropic = AsyncAnthropic()
    return _anthropic

options.set_global_options(region=options.SupportedRegion.US_CENTRAL1)

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def json_resp(data, status=200):
    import flask
    r = flask.make_response(json.dumps(data, ensure_ascii=False, default=str), status)
    for k, v in CORS.items():
        r.headers[k] = v
    return r

def verify_token(req):
    header = req.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAUTHENTICATED, "Token ausente")
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        return auth.verify_id_token(header.split(" ", 1)[1])["uid"]
    except Exception:
        raise https_fn.HttpsError(https_fn.FunctionsErrorCode.UNAUTHENTICATED, "Token inválido")


# ── PROCESS ───────────────────────────────────────────────────────────────────

@https_fn.on_request(timeout_sec=300, memory=options.MemoryOption.MB_512)
def process(req: https_fn.Request):
    if req.method == "OPTIONS":
        return json_resp({})

    verify_token(req)
    body = req.get_json(silent=True) or {}
    job_id  = body.get("jobId")
    cand_id = body.get("candidateId")

    if not job_id or not cand_id:
        return json_resp({"error": "jobId e candidateId obrigatórios"}, 400)

    return asyncio.run(_process(job_id, cand_id))


async def _process(job_id: str, cand_id: str):
    db = get_db()
    ref      = db.collection("jobs").document(job_id).collection("candidates").document(cand_id)
    cand_doc = await ref.get()
    job_doc  = await db.collection("jobs").document(job_id).get()

    if not cand_doc.exists or not job_doc.exists:
        return json_resp({"error": "Não encontrado"}, 404)

    cand = cand_doc.to_dict()
    job  = job_doc.to_dict()

    await ref.update({"status": "processing"})

    try:
        profile = await _fetch_profile(cand["linkedinUrl"])
        scoring = await _score_candidate(profile, job["description"])
        c = scoring.get("criterios", {})

        await ref.update({
            "status":          "done",
            "fullName":        profile.get("full_name"),
            "headline":        profile.get("headline"),
            "scoreTotal":      scoring.get("score_total", 0),
            "scoreExperience": c.get("experiencia_relevante", 0),
            "scoreSkills":     c.get("habilidades_tecnicas", 0),
            "scoreEducation":  c.get("formacao", 0),
            "scoreLanguages":  c.get("idiomas", 0),
            "scoreCultural":   c.get("fit_cultural", 0),
            "recommendation":  scoring.get("recomendacao", "FRACO"),
            "strengths":       scoring.get("pontos_fortes", []),
            "concerns":        scoring.get("pontos_atencao", []),
            "summaryLlm":      scoring.get("resumo", ""),
            "processedAt":     datetime.now(timezone.utc).isoformat(),
        })
        return json_resp({"status": "done", "score": scoring.get("score_total", 0)})

    except Exception as e:
        await ref.update({"status": "error", "errorMsg": str(e)})
        return json_resp({"error": str(e)}, 500)


# ── LinkdAPI: busca perfil real ───────────────────────────────────────────────

async def _fetch_profile(linkedin_url: str) -> dict:
    """Busca perfil via LinkdAPI e normaliza para o formato interno."""
    key = os.getenv("LINKDAPI_KEY", "")
    if not key:
        return _mock_profile(linkedin_url)

    # Extrai username da URL
    username = linkedin_url.rstrip("/").split("/in/")[-1].rstrip("/")
    if not username or username == linkedin_url:
        raise RuntimeError(f"URL inválida: {linkedin_url}")

    try:
        from linkdapi import AsyncLinkdAPI
        async with AsyncLinkdAPI(key) as api:
            # Busca perfil completo em chamadas paralelas
            overview_resp = await api.get_profile_overview(username)
            if not overview_resp.get("success"):
                raise RuntimeError(f"Perfil não encontrado: {username}")

            overview = overview_resp.get("data", {})
            urn = overview.get("urn")

            if urn:
                exp_resp, edu_resp, skills_resp = await asyncio.gather(
                    api.get_full_experience(urn),
                    api.get_education(urn),
                    api.get_skills(urn),
                    return_exceptions=True
                )
            else:
                exp_resp = edu_resp = skills_resp = {}

            return _normalize_linkdapi(overview, exp_resp, edu_resp, skills_resp)

    except ImportError:
        raise RuntimeError("linkdapi não instalado")
    except Exception as e:
        raise RuntimeError(f"Erro LinkdAPI: {e}")


def _normalize_linkdapi(overview: dict, exp_resp, edu_resp, skills_resp) -> dict:
    """Converte resposta do LinkdAPI para o formato que o scoring espera."""

    # Experiências
    experiences = []
    exp_data = exp_resp.get("data", []) if isinstance(exp_resp, dict) else []
    for e in exp_data[:6]:
        experiences.append({
            "company": e.get("companyName") or e.get("company", "?"),
            "title":   e.get("title", "?"),
            "description": e.get("description", ""),
            "starts_at": {"year": e.get("startYear")} if e.get("startYear") else None,
            "ends_at":   {"year": e.get("endYear")}   if e.get("endYear")   else None,
        })

    # Educação
    education = []
    edu_data = edu_resp.get("data", []) if isinstance(edu_resp, dict) else []
    for ed in edu_data[:3]:
        education.append({
            "school":      ed.get("schoolName", "?"),
            "degree_name": ed.get("degree", "") + " " + ed.get("fieldOfStudy", ""),
        })

    # Skills
    skills = []
    sk_data = skills_resp.get("data", []) if isinstance(skills_resp, dict) else []
    for s in sk_data[:20]:
        name = s.get("name") or s.get("skill", "")
        if name:
            skills.append(name)

    # Idiomas do overview
    languages = []
    for lang in (overview.get("languages") or [])[:5]:
        languages.append({"name": lang.get("name", "?")})

    return {
        "full_name": overview.get("fullName") or f"{overview.get('firstName','')} {overview.get('lastName','')}".strip(),
        "headline":  overview.get("headline", ""),
        "summary":   overview.get("summary") or overview.get("about", ""),
        "experiences": experiences,
        "education":   education,
        "skills":      skills,
        "languages":   languages,
    }


def _mock_profile(url: str) -> dict:
    """Perfil simulado quando LINKDAPI_KEY não está configurado."""
    slug = url.rstrip("/").split("/in/")[-1]
    name = slug.replace("-", " ").title() if slug else "Candidato Teste"
    return {
        "full_name": name,
        "headline": "Analista de Comércio Exterior | SISCOMEX | Drawback | SC",
        "summary": "Profissional com 6 anos de experiência em comércio exterior.",
        "experiences": [
            {"company": "Exportadora Sul Ltda", "title": "Analista de Comércio Exterior Pleno",
             "description": "Gestão de importação/exportação, NCM, SISCOMEX.",
             "starts_at": {"year": 2019}, "ends_at": None},
        ],
        "education": [
            {"school": "UNIVALI", "degree_name": "Bacharel em Comércio Exterior"}
        ],
        "skills": ["Comércio Exterior", "SISCOMEX", "NCM", "Drawback", "Incoterms"],
        "languages": [{"name": "Inglês"}],
    }


# ── LLM Scoring ───────────────────────────────────────────────────────────────

SYSTEM = """Você é especialista em recrutamento. Avalie candidatos com base na vaga.
Responda SOMENTE em JSON válido, sem markdown."""

PROMPT = """Vaga:
{job}

Candidato:
{profile}

Retorne JSON:
{{
  "score_total": <0-100>,
  "criterios": {{
    "experiencia_relevante": <0-25>,
    "habilidades_tecnicas": <0-25>,
    "formacao": <0-20>,
    "idiomas": <0-15>,
    "fit_cultural": <0-15>
  }},
  "pontos_fortes": ["<str>","<str>","<str>"],
  "pontos_atencao": ["<str>","<str>"],
  "resumo": "<2-3 frases justificando a nota>",
  "recomendacao": "<FORTE|MODERADO|FRACO>"
}}"""


def _fmt(p: dict) -> str:
    lines = [f"NOME: {p.get('full_name','?')}", f"TÍTULO: {p.get('headline','?')}"]
    if p.get("summary"):
        lines.append(f"RESUMO: {p['summary']}")
    for e in (p.get("experiences") or [])[:4]:
        yr  = (e.get("starts_at") or {}).get("year", "?") if e.get("starts_at") else "?"
        end = (e.get("ends_at") or {}).get("year", "atual") if e.get("ends_at") else "atual"
        lines.append(f"• {e.get('title')} @ {e.get('company')} ({yr}–{end})")
        if e.get("description"):
            lines.append(f"  {e['description'][:180]}")
    for ed in (p.get("education") or [])[:2]:
        lines.append(f"• {ed.get('degree_name')} — {ed.get('school')}")
    if p.get("skills"):
        lines.append(f"SKILLS: {', '.join(p['skills'][:18])}")
    if p.get("languages"):
        lines.append(f"IDIOMAS: {', '.join(l.get('name','?') for l in p['languages'])}")
    return "\n".join(lines)


async def _score_candidate(profile: dict, job_description: str) -> dict:
    prompt = PROMPT.format(job=job_description, profile=_fmt(profile))
    client = get_anthropic()
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        system=SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(response.content[0].text.strip())
