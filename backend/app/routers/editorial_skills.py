"""
API de gestão das skills editoriais por canal (E-021).

Expõe o serviço `editorial_skills` como REST: listar as 5 skills do canal ativo
(com valor-do-canal + default para a UI mostrar "default vs atual"), editar
(corpo/params/lentes) e resetar campos ao default. Router FINO — só converte
HTTP ↔ serviço e mapeia os erros de domínio para os status corretos.

Router DEDICADO (e não em `routers/settings.py`, que está travado por f024):
skills editoriais são uma preocupação própria, então ganham seu próprio endpoint.
"""

from __future__ import annotations

from app import editorial_scaffolds, editorial_skills
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class SkillParamsModel(BaseModel):
    """Params da etapa (Claude): modelo + thinking tokens + timeout."""

    modelo: str
    thinking_tokens: int
    timeout: float


class SkillDescritaResponse(BaseModel):
    """Uma skill do canal para a UI: metadados + valor-do-canal + default (reset)."""

    key: str
    etapa: str
    descricao: str
    corpo: str
    params: SkillParamsModel
    lentes: list[str]
    corpo_default: str
    params_default: SkillParamsModel
    lentes_default: list[str]


class ListaSkillsResponse(BaseModel):
    skills: list[SkillDescritaResponse]


class UpdateSkillRequest(BaseModel):
    """Campos editáveis (todos opcionais; só os informados mudam — merge)."""

    corpo: str | None = None
    params: SkillParamsModel | None = None
    lentes: list[str] | None = None


class ResetSkillRequest(BaseModel):
    """Campos a restaurar ao default: subconjunto de {corpo, params, lentes}."""

    campos: list[str]


def _para_response(skill: editorial_skills.SkillDescrita) -> SkillDescritaResponse:
    return SkillDescritaResponse(
        key=skill.key,
        etapa=skill.etapa,
        descricao=skill.descricao,
        corpo=skill.corpo,
        params=SkillParamsModel(**skill.params),
        lentes=skill.lentes,
        corpo_default=skill.corpo_default,
        params_default=SkillParamsModel(**skill.params_default),
        lentes_default=skill.lentes_default,
    )


@router.get("", response_model=ListaSkillsResponse)
async def listar_skills():
    return ListaSkillsResponse(
        skills=[_para_response(s) for s in editorial_skills.descrever_skills()]
    )


@router.put("/{skill_key}", response_model=SkillDescritaResponse)
async def editar_skill(skill_key: str, body: UpdateSkillRequest):
    try:
        skill = editorial_skills.definir_skill(
            skill_key,
            corpo=body.corpo,
            params=body.params.model_dump() if body.params is not None else None,
            lentes=body.lentes,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Skill desconhecida: {skill_key!r}.") from e
    return _para_response(skill)


@router.post("/{skill_key}/reset", response_model=SkillDescritaResponse)
async def resetar_skill(skill_key: str, body: ResetSkillRequest):
    try:
        skill = editorial_skills.resetar_skill(skill_key, body.campos)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Skill desconhecida: {skill_key!r}.") from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return _para_response(skill)


# --------------------------------------------------------------------------- #
# Scaffolds (contrato de saída) por canal (D-297)
# --------------------------------------------------------------------------- #
# Montados no MESMO router (sub-caminho /scaffolds) para não exigir registro de um
# router novo em main.py (travado). Mesma preocupação editorial, endpoint irmão.


class ScaffoldDescritoResponse(BaseModel):
    """Um scaffold do canal para a UI: metadados + valor-do-canal + default (reset)."""

    key: str
    etapa: str
    descricao: str
    scaffold: str
    scaffold_default: str
    # Placeholders exigidos ({...}) e o marcador do contrato de saída — a UI mostra
    # ambos como guia de edição.
    placeholders: list[str]
    marcador: str


class ListaScaffoldsResponse(BaseModel):
    scaffolds: list[ScaffoldDescritoResponse]


class UpdateScaffoldRequest(BaseModel):
    scaffold: str


def _para_response_scaffold(s: editorial_scaffolds.ScaffoldDescrito) -> ScaffoldDescritoResponse:
    return ScaffoldDescritoResponse(
        key=s.key,
        etapa=s.etapa,
        descricao=s.descricao,
        scaffold=s.scaffold,
        scaffold_default=s.scaffold_default,
        placeholders=s.placeholders,
        marcador=s.marcador,
    )


@router.get("/scaffolds", response_model=ListaScaffoldsResponse)
async def listar_scaffolds():
    return ListaScaffoldsResponse(
        scaffolds=[_para_response_scaffold(s) for s in editorial_scaffolds.descrever_scaffolds()]
    )


@router.put("/scaffolds/{scaffold_key}", response_model=ScaffoldDescritoResponse)
async def editar_scaffold(scaffold_key: str, body: UpdateScaffoldRequest):
    try:
        scaffold = editorial_scaffolds.definir_scaffold(scaffold_key, body.scaffold)
    except KeyError as e:
        raise HTTPException(
            status_code=404, detail=f"Scaffold desconhecido: {scaffold_key!r}."
        ) from e
    except ValueError as e:
        # Guardrail do contrato: placeholder/marcador inválido → 422 com a razão.
        raise HTTPException(status_code=422, detail=str(e)) from e
    return _para_response_scaffold(scaffold)


@router.post("/scaffolds/{scaffold_key}/reset", response_model=ScaffoldDescritoResponse)
async def resetar_scaffold(scaffold_key: str):
    try:
        scaffold = editorial_scaffolds.resetar_scaffold(scaffold_key)
    except KeyError as e:
        raise HTTPException(
            status_code=404, detail=f"Scaffold desconhecido: {scaffold_key!r}."
        ) from e
    return _para_response_scaffold(scaffold)
