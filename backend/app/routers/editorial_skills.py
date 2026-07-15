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

from app import editorial_scaffolds, editorial_skills, prompts_utilitarios, ranking_settings
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


# --------------------------------------------------------------------------- #
# Pesos e critérios do ranking de lives por canal (D-351)
# --------------------------------------------------------------------------- #
# Os pesos do ranking (views/likes/comentários/sentimento/recência) e a meia-vida
# saem do `.env` e viram editáveis por canal. Montados no MESMO router (sub-caminho
# /ranking-pesos) para não exigir registro de um router novo em main.py (travado).
#
# Registrados ANTES de `PUT /{skill_key}` (D-374): rotas com um único segmento
# literal (`/ranking-pesos`) colidem com o padrão genérico `/{skill_key}` — o
# Starlette casa por ORDEM de registro, então a rota genérica capturava o PUT
# antes da específica e derrubava "Skill desconhecida: 'ranking-pesos'" (404).


class CriterioRankingResponse(BaseModel):
    """Um critério do ranking para a UI: rótulo/descrição + valor + default (reset)."""

    key: str
    rotulo: str
    descricao: str
    # True para os 5 pesos (participam do reescalonamento); False para a meia-vida.
    eh_peso: bool
    valor: float
    valor_default: float


class ListaRankingPesosResponse(BaseModel):
    criterios: list[CriterioRankingResponse]


class UpdateRankingPesosRequest(BaseModel):
    """Todos os critérios de uma vez — o reescalonamento é sobre o conjunto."""

    views: float
    likes_por_view: float
    comentarios_por_view: float
    sentimento: float
    recencia: float
    vph: float
    meia_vida_dias: float


def _para_response_criterio(c: ranking_settings.CriterioDescrito) -> CriterioRankingResponse:
    return CriterioRankingResponse(
        key=c.key,
        rotulo=c.rotulo,
        descricao=c.descricao,
        eh_peso=c.eh_peso,
        valor=c.valor,
        valor_default=c.valor_default,
    )


@router.get("/ranking-pesos", response_model=ListaRankingPesosResponse)
async def listar_ranking_pesos():
    return ListaRankingPesosResponse(
        criterios=[_para_response_criterio(c) for c in ranking_settings.descrever_pesos()]
    )


@router.put("/ranking-pesos", response_model=ListaRankingPesosResponse)
async def editar_ranking_pesos(body: UpdateRankingPesosRequest):
    try:
        criterios = ranking_settings.definir_pesos(body.model_dump())
    except ValueError as e:
        # Guardrail: peso negativo, todos-zero ou meia-vida <= 0 → 422 com a razão.
        raise HTTPException(status_code=422, detail=str(e)) from e
    return ListaRankingPesosResponse(criterios=[_para_response_criterio(c) for c in criterios])


# GET (não POST): resetar-para-o-padrão é idempotente e sem corpo. Um POST sem body
# vinha disparando 422 "body Field required" no cliente/stack; GET evita isso e casa
# com a natureza sem-payload da operação.
@router.get("/ranking-pesos/reset", response_model=ListaRankingPesosResponse)
async def resetar_ranking_pesos():
    return ListaRankingPesosResponse(
        criterios=[_para_response_criterio(c) for c in ranking_settings.resetar_pesos()]
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
# Histórico de versões por skill (D-312) — auditar e reverter (append-only)
# --------------------------------------------------------------------------- #


class SkillVersaoResponse(BaseModel):
    """Uma versão da skill para a UI de histórico: data + resumo do que mudou."""

    versao: int
    criado_em: str
    vigente: bool
    resumo: str
    mudancas: list[str]


class ListaVersoesResponse(BaseModel):
    versoes: list[SkillVersaoResponse]


class ReverterSkillRequest(BaseModel):
    versao: int


def _para_response_versao(v: editorial_skills.SkillVersaoDescrita) -> SkillVersaoResponse:
    return SkillVersaoResponse(
        versao=v.versao,
        criado_em=v.criado_em,
        vigente=v.vigente,
        resumo=v.resumo,
        mudancas=v.mudancas,
    )


@router.get("/{skill_key}/versoes", response_model=ListaVersoesResponse)
async def listar_versoes_skill(skill_key: str):
    try:
        versoes = editorial_skills.listar_versoes(skill_key)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Skill desconhecida: {skill_key!r}.") from e
    return ListaVersoesResponse(versoes=[_para_response_versao(v) for v in versoes])


@router.post("/{skill_key}/reverter", response_model=SkillDescritaResponse)
async def reverter_skill(skill_key: str, body: ReverterSkillRequest):
    try:
        skill = editorial_skills.reverter_skill(skill_key, body.versao)
    except KeyError as e:
        # Skill desconhecida OU versão inexistente — ambas caem em 404 (recurso ausente).
        raise HTTPException(status_code=404, detail=str(e)) from e
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


# --------------------------------------------------------------------------- #
# Prompts utilitários por canal (D-348)
# --------------------------------------------------------------------------- #
# Prompts de IA auxiliares (fora do pipeline de corte) antes hardcoded, agora
# editáveis por canal. Montados no MESMO router (sub-caminho /prompts-utilitarios)
# para não exigir registro de um router novo em main.py (travado).


class PromptUtilitarioResponse(BaseModel):
    """Um prompt utilitário do canal para a UI: metadados + valor + default (reset)."""

    key: str
    etapa: str
    descricao: str
    prompt: str
    prompt_default: str
    placeholders: list[str]
    marcador: str


class ListaPromptsUtilitariosResponse(BaseModel):
    prompts: list[PromptUtilitarioResponse]


class UpdatePromptUtilitarioRequest(BaseModel):
    prompt: str


def _para_response_prompt(p: prompts_utilitarios.PromptDescrito) -> PromptUtilitarioResponse:
    return PromptUtilitarioResponse(
        key=p.key,
        etapa=p.etapa,
        descricao=p.descricao,
        prompt=p.prompt,
        prompt_default=p.prompt_default,
        placeholders=p.placeholders,
        marcador=p.marcador,
    )


@router.get("/prompts-utilitarios", response_model=ListaPromptsUtilitariosResponse)
async def listar_prompts_utilitarios():
    return ListaPromptsUtilitariosResponse(
        prompts=[_para_response_prompt(p) for p in prompts_utilitarios.descrever_prompts()]
    )


@router.put("/prompts-utilitarios/{key}", response_model=PromptUtilitarioResponse)
async def editar_prompt_utilitario(key: str, body: UpdatePromptUtilitarioRequest):
    try:
        prompt = prompts_utilitarios.definir_prompt(key, body.prompt)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Prompt desconhecido: {key!r}.") from e
    except ValueError as e:
        # Guardrail do contrato: placeholder/marcador inválido → 422 com a razão.
        raise HTTPException(status_code=422, detail=str(e)) from e
    return _para_response_prompt(prompt)


@router.post("/prompts-utilitarios/{key}/reset", response_model=PromptUtilitarioResponse)
async def resetar_prompt_utilitario(key: str):
    try:
        prompt = prompts_utilitarios.resetar_prompt(key)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Prompt desconhecido: {key!r}.") from e
    return _para_response_prompt(prompt)
