"""
Skills editoriais do canal, centralizadas no banco (E-021).

As 5 skills editoriais (propor cortes, trechos a remover, cenas, metadados e
prompt de thumbnail) têm, POR CANAL: o CORPO do prompt, as LENTES de variação e
os PARAMS da etapa (modelo/thinking/timeout do Claude; temperature quando a etapa
tem um passo Gemini adjacente). Antes viviam espalhados: corpo em
`instance/.../editorial/*.md` (D-144), lentes em `domain/variacao_prompt._LENTES`
e params em `config.settings.*` — tudo GLOBAL, não por canal.

FONTE DA VERDADE (E-021): o banco de settings (`settings_store`, tabela
`editorial_skill`), uma linha por (canal, skill) — o MESMO padrão que a D-191
aplicou às app settings e a D-285 ao mascote. O `editorial/*.md` continua sendo
escrito como ESPELHO de compat/backup do CORPO e serve de FALLBACK+migração:
quando o banco ainda não tem a linha da skill (primeiro acesso), o accessor lê o
`.md` do canal (corpo atual) + os globais de código (params/lentes) e SEMEIA o
banco a partir deles — preservando a saída idêntica do canal ativo (só muda a
ORIGEM: arquivo/código → banco).

Os DEFAULTS GENÉRICOS versionados (alvo do "resetar para o padrão") são os
templates de `examples/instance.example/editorial/*.md` (corpo), os globais de
`config.settings` (params) e `variacao_prompt` (lentes) — nada de branding.

Camada: config/loader (I/O de filesystem + banco de settings), o mesmo lugar de
`editorial_identity` e `channel_paths`. A fachada de runtime (`resolver_skill`) é
consumida pelos serviços/infra de geração; a fachada de gestão
(`descrever_skills`, `definir_skill`, `resetar_skill`) alimenta a UI de Canais.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app import channel_paths
from app.channel_paths import editorial_dir
from app.config import settings
from app.domain import variacao_prompt
from app.services import settings_store

# app -> backend -> raiz do repo (mesma ancoragem de channel_paths/channels).
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_EXEMPLO_EDITORIAL = _REPO_ROOT / "examples" / "instance.example" / "editorial"


@dataclass(frozen=True)
class SkillCatalogo:
    """Metadados estáticos de uma skill editorial (não variam por canal).

    - `arquivo`: nome do `.md` em `editorial/` (corpo/espelho).
    - `etapa`/`descricao`: rótulo e explicação funcional para a UI.
    - `model_setting`/`thinking_setting`/`timeout_setting`: nomes dos atributos em
      `config.settings` de onde vêm os DEFAULTS de modelo, thinking tokens e
      timeout da etapa. `timeout_setting` tem default (`claude_cli_timeout`, o
      global) — só a etapa cortes aponta para um setting próprio (D-300: thinking
      estendido aumenta latência, então cortes precisa de mais fôlego).
    - `lentes_tipo`: chave em `variacao_prompt` das lentes default (None = etapa
      sem lentes — trechos/thumbnail, consistência ou anti-mode-collapse por design).

    Só params do Claude (modelo/thinking/timeout): as 5 skills são geração de TEXTO
    via `claude -p`, que não tem `temperature` — esta vive só nas etapas Gemini
    (cenas_remotion/desvios/shorts), fora do escopo destas skills.
    """

    key: str
    arquivo: str
    etapa: str
    descricao: str
    model_setting: str
    thinking_setting: str
    lentes_tipo: str | None
    timeout_setting: str = "claude_cli_timeout"


# Ordem = ordem de exibição na UI. Descrições explicam PARA QUE SERVE cada skill.
_CATALOGO: tuple[SkillCatalogo, ...] = (
    SkillCatalogo(
        key="cortador-expert",
        arquivo="cortes.md",
        etapa="Propor cortes",
        descricao=(
            "Analisa a transcrição da live inteira e propõe os cortes temáticos "
            "(início/fim, título e tema de cada corte), marcando também os trechos "
            "a descartar. É o primeiro passo do pipeline de análise."
        ),
        model_setting="claude_model_analise",
        thinking_setting="claude_cli_thinking_tokens_analise",
        timeout_setting="claude_cli_timeout_analise",
        lentes_tipo="cortes",
    ),
    SkillCatalogo(
        key="trechos-expert",
        arquivo="trechos.md",
        etapa="Trechos a remover (desvios)",
        descricao=(
            "Revisa UM corte já recortado e identifica só os trechos a remover — "
            "digressões, bate-papo com o chat, repetições, silêncios. Usada ao "
            "regerar os desvios de um corte. Sem lentes por design (a remoção deve "
            "ser consistente, não variada)."
        ),
        model_setting="claude_model_analise",
        thinking_setting="claude_cli_thinking_tokens_trechos",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="cenas-expert",
        arquivo="cenas.md",
        etapa="Cenas do vídeo",
        descricao=(
            "Gera as cenas Remotion de um corte (ênfases, citações, fichas, "
            "perguntas de transição) a partir da transcrição final."
        ),
        model_setting="claude_model_cenas",
        thinking_setting="claude_cli_max_thinking_tokens",
        lentes_tipo="cenas",
    ),
    SkillCatalogo(
        key="metadados-expert",
        arquivo="metadados.md",
        etapa="Metadados YouTube",
        descricao=(
            "Gera título, descrição e texto de capa do corte para o YouTube, "
            "seguindo as regras editoriais do canal e evitando repetir a série."
        ),
        model_setting="claude_model_metadados",
        thinking_setting="claude_cli_max_thinking_tokens",
        lentes_tipo="metadados",
    ),
    SkillCatalogo(
        key="thumbnail-prompt-expert",
        arquivo="thumbnail.md",
        etapa="Prompt de thumbnail",
        descricao=(
            "Escreve o prompt de imagem da capa (cenário, elenco, roupa, luz, "
            "tipografia) que alimenta o gerador de imagem. Usa mais thinking por "
            "qualidade. Sem lentes de sorteio por design (a variação vem da memória "
            "global das capas anteriores, anti-mode-collapse)."
        ),
        model_setting="claude_model_thumbnail",
        thinking_setting="claude_cli_thinking_tokens_thumbnail",
        lentes_tipo=None,
    ),
)

_CATALOGO_POR_KEY: dict[str, SkillCatalogo] = {c.key: c for c in _CATALOGO}


@dataclass(frozen=True)
class SkillResolvida:
    """Skill de um canal já resolvida para consumo em runtime.

    `lentes` é a lista (possivelmente vazia) de lentes de variação da etapa.
    """

    key: str
    corpo: str
    modelo: str
    thinking_tokens: int
    timeout: float
    lentes: list[str]


def catalogo() -> tuple[SkillCatalogo, ...]:
    """As 5 skills editoriais, na ordem de exibição."""
    return _CATALOGO


def _exigir_catalogo(skill_key: str) -> SkillCatalogo:
    cat = _CATALOGO_POR_KEY.get(skill_key)
    if cat is None:
        raise KeyError(f"Skill editorial desconhecida: {skill_key!r}.")
    return cat


# --------------------------------------------------------------------------- #
# Defaults genéricos (alvo do "resetar para o padrão")
# --------------------------------------------------------------------------- #


def _default_corpo(cat: SkillCatalogo, exemplo_root: Path | None) -> str:
    """Corpo default = template genérico versionado (`examples/.../editorial`)."""
    raiz = Path(exemplo_root) if exemplo_root is not None else _EXEMPLO_EDITORIAL
    caminho = raiz / cat.arquivo
    if not caminho.is_file():
        return ""
    return caminho.read_text(encoding="utf-8").strip()


def _default_params(cat: SkillCatalogo) -> dict:
    """Params default a partir dos globais de `config.settings`."""
    return {
        "modelo": str(getattr(settings, cat.model_setting)),
        "thinking_tokens": int(getattr(settings, cat.thinking_setting)),
        "timeout": float(getattr(settings, cat.timeout_setting)),
    }


def _default_lentes(cat: SkillCatalogo) -> list[str]:
    """Lentes default a partir de `variacao_prompt` (vazio p/ trechos/thumbnail)."""
    if cat.lentes_tipo is None:
        return []
    return variacao_prompt.repertorio(cat.lentes_tipo)


# --------------------------------------------------------------------------- #
# Coerção defensiva dos params (banco pode ter JSON fora de faixa/tipo)
# --------------------------------------------------------------------------- #


def _coerce_int(raw: object, default: int, *, minimo: int) -> int:
    try:
        valor = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return valor if valor >= minimo else default


def _coerce_float(raw: object, default: float, *, minimo: float, maximo: float) -> float:
    try:
        valor = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return valor if minimo <= valor <= maximo else default


def _coerce_params(raw: dict, cat: SkillCatalogo) -> dict:
    """Normaliza um dict de params contra os defaults da skill (defesa a dado ruim)."""
    defaults = _default_params(cat)
    if not isinstance(raw, dict):
        return defaults
    return {
        "modelo": str(raw.get("modelo") or defaults["modelo"]),
        "thinking_tokens": _coerce_int(
            raw.get("thinking_tokens"), defaults["thinking_tokens"], minimo=0
        ),
        "timeout": _coerce_float(
            raw.get("timeout"), defaults["timeout"], minimo=1.0, maximo=3600.0
        ),
    }


def _coerce_lentes(raw: object, cat: SkillCatalogo) -> list[str]:
    """Normaliza a lista de lentes (só strings não-vazias); default se inválida."""
    if not isinstance(raw, list):
        return _default_lentes(cat)
    return [str(x).strip() for x in raw if str(x).strip()]


# --------------------------------------------------------------------------- #
# Resolução por canal (banco → seed a partir do .md/globais → default)
# --------------------------------------------------------------------------- #


def _channel_id_ativo() -> str:
    """Id do canal ATIVO (chave da linha no `settings_store`), espelha D-285."""
    return channel_paths.active_channel_root().name


def _resolver_db_e_canal(db_path: Path | None, channel_id: str | None) -> tuple[Path, str]:
    db = db_path if db_path is not None else channel_paths.settings_db_path()
    cid = channel_id if channel_id is not None else _channel_id_ativo()
    return db, cid


def _corpo_atual_do_canal(cat: SkillCatalogo, editorial_root: Path | None) -> str:
    """Corpo vigente do canal: `editorial/<arquivo>.md` (override do canal), ou o
    default genérico quando o canal ainda não tem o arquivo."""
    raiz = Path(editorial_root) if editorial_root is not None else editorial_dir()
    caminho = raiz / cat.arquivo
    if caminho.is_file():
        corpo = caminho.read_text(encoding="utf-8").strip()
        if corpo:
            return corpo
    return _default_corpo(cat, None)


def _linha_para_resolvida(cat: SkillCatalogo, linha: dict) -> SkillResolvida:
    """Constrói `SkillResolvida` a partir de uma linha do banco (JSON coagido)."""
    try:
        params_raw = json.loads(linha.get("params_json") or "{}")
    except json.JSONDecodeError:
        params_raw = {}
    try:
        lentes_raw = json.loads(linha.get("lentes_json") or "[]")
    except json.JSONDecodeError:
        lentes_raw = []
    params = _coerce_params(params_raw, cat)
    return SkillResolvida(
        key=cat.key,
        corpo=str(linha.get("corpo") or "").strip(),
        modelo=params["modelo"],
        thinking_tokens=params["thinking_tokens"],
        timeout=params["timeout"],
        lentes=_coerce_lentes(lentes_raw, cat),
    )


def _semear(
    cat: SkillCatalogo,
    db: Path,
    cid: str,
    editorial_root: Path | None,
) -> dict:
    """Semeia (idempotente) a linha da skill no banco a partir do estado ATUAL do
    canal (corpo do `.md` + params/lentes globais de código) e devolve a linha.

    Preserva a saída idêntica do canal ativo: o corpo é o mesmo do `.md`, os params
    são os globais que o código usava, as lentes são as de `variacao_prompt`.
    """
    valores = {
        "corpo": _corpo_atual_do_canal(cat, editorial_root),
        "params_json": json.dumps(_default_params(cat), ensure_ascii=False),
        "lentes_json": json.dumps(_default_lentes(cat), ensure_ascii=False),
    }
    settings_store.gravar_skill(db, cid, cat.key, valores)
    return {**valores, "updated_at": ""}


def resolver_skill(
    skill_key: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> SkillResolvida:
    """Resolve a skill do canal ATIVO — banco como fonte da verdade (E-021).

    Ordem (espelha `AppSettingsService._load` / `identidade_do_mascote`):
      1. BANCO: se há linha, é a fonte da verdade.
      2. Sem linha → SEMEIA (idempotente) a partir do `.md` do canal + globais e
         devolve. A partir daí o banco basta.

    Nunca lança no caminho feliz. Os kwargs isolam testes do `instance/` real.
    """
    cat = _exigir_catalogo(skill_key)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    linha = settings_store.ler_skill(db, cid, skill_key)
    if linha is None:
        linha = _semear(cat, db, cid, editorial_root)
    return _linha_para_resolvida(cat, linha)


# --------------------------------------------------------------------------- #
# Fachada de gestão (UI de Canais): default vs valor-do-canal, editar, resetar
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class SkillDescrita:
    """Skill para a UI: metadados + valor-do-canal + default (alvo do reset)."""

    key: str
    etapa: str
    descricao: str
    corpo: str
    params: dict
    lentes: list[str]
    corpo_default: str
    params_default: dict
    lentes_default: list[str]


def _descrever(cat: SkillCatalogo, resolvida: SkillResolvida) -> SkillDescrita:
    return SkillDescrita(
        key=cat.key,
        etapa=cat.etapa,
        descricao=cat.descricao,
        corpo=resolvida.corpo,
        params=_params_de(resolvida),
        lentes=resolvida.lentes,
        corpo_default=_default_corpo(cat, None),
        params_default=_default_params(cat),
        lentes_default=_default_lentes(cat),
    )


def descrever_skills(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> list[SkillDescrita]:
    """As 5 skills do canal ativo com valor-do-canal + default, para a UI."""
    return [
        _descrever(
            cat,
            resolver_skill(
                cat.key, db_path=db_path, channel_id=channel_id, editorial_root=editorial_root
            ),
        )
        for cat in _CATALOGO
    ]


def _espelhar_corpo_no_md(cat: SkillCatalogo, corpo: str, editorial_root: Path | None) -> None:
    """Escreve o corpo no `editorial/<arquivo>.md` (espelho de compat, como o mascote)."""
    raiz = Path(editorial_root) if editorial_root is not None else editorial_dir()
    raiz.mkdir(parents=True, exist_ok=True)
    (raiz / cat.arquivo).write_text(corpo.strip() + "\n", encoding="utf-8")


def definir_skill(
    skill_key: str,
    *,
    corpo: str | None = None,
    params: dict | None = None,
    lentes: list[str] | None = None,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> SkillDescrita:
    """Edita a skill do canal ativo pela UI. Só os campos informados mudam (merge).

    Grava no BANCO (fonte da verdade) e ESPELHA o corpo no `.md`. Devolve a skill
    já descrita (valor-do-canal + default).
    """
    cat = _exigir_catalogo(skill_key)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    atual = resolver_skill(skill_key, db_path=db, channel_id=cid, editorial_root=editorial_root)

    novo_corpo = atual.corpo if corpo is None else corpo.strip()
    novos_params = _coerce_params(params, cat) if params is not None else _params_de(atual)
    novas_lentes = _coerce_lentes(lentes, cat) if lentes is not None else atual.lentes

    settings_store.gravar_skill(
        db,
        cid,
        skill_key,
        {
            "corpo": novo_corpo,
            "params_json": json.dumps(novos_params, ensure_ascii=False),
            "lentes_json": json.dumps(novas_lentes, ensure_ascii=False),
        },
    )
    if corpo is not None:
        _espelhar_corpo_no_md(cat, novo_corpo, editorial_root)
    return _descrever(
        cat, resolver_skill(skill_key, db_path=db, channel_id=cid, editorial_root=editorial_root)
    )


def _params_de(resolvida: SkillResolvida) -> dict:
    """Extrai o dict de params de uma `SkillResolvida` (para regravar/descrever)."""
    return {
        "modelo": resolvida.modelo,
        "thinking_tokens": resolvida.thinking_tokens,
        "timeout": resolvida.timeout,
    }


# Campos que o reset aceita — mapeiam 1:1 aos campos editáveis da skill.
_CAMPOS_RESET = ("corpo", "params", "lentes")


def resetar_skill(
    skill_key: str,
    campos: list[str],
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> SkillDescrita:
    """Restaura os `campos` informados ao DEFAULT genérico (reset-para-o-padrão).

    `campos` ⊆ {"corpo", "params", "lentes"}. Os demais campos são preservados.
    """
    cat = _exigir_catalogo(skill_key)
    invalidos = set(campos) - set(_CAMPOS_RESET)
    if invalidos:
        raise ValueError(f"Campos de reset inválidos: {sorted(invalidos)}.")
    return definir_skill(
        skill_key,
        corpo=_default_corpo(cat, None) if "corpo" in campos else None,
        params=_default_params(cat) if "params" in campos else None,
        lentes=_default_lentes(cat) if "lentes" in campos else None,
        db_path=db_path,
        channel_id=channel_id,
        editorial_root=editorial_root,
    )


# --------------------------------------------------------------------------- #
# Migração pontual D-300: thinking/timeout elevados na análise, para canais que
# já tinham a linha semeada com os defaults ANTIGOS (compartilhados com cenas/
# metadados). Comparar contra o valor ANTIGO — nunca contra o novo — preserva
# qualquer customização feita pela UI de Canais.
# --------------------------------------------------------------------------- #

_D300_THINKING_ANTIGO = 0  # era `claude_cli_max_thinking_tokens` para cortes/trechos
_D300_TIMEOUT_ANTIGO = 300.0  # era `claude_cli_timeout` para a etapa cortes

# Novo default de thinking por skill — só as duas etapas alcançadas pelo D-300.
_D300_THINKING_NOVO: dict[str, int] = {
    "cortador-expert": settings.claude_cli_thinking_tokens_analise,
    "trechos-expert": settings.claude_cli_thinking_tokens_trechos,
}


def _migrar_linha_d300(cat: SkillCatalogo, db: Path, cid: str, linha: dict) -> None:
    """Eleva thinking_tokens (e, só em cortes, o timeout) de uma linha JÁ
    existente quando o valor gravado ainda é o default ANTIGO.

    No-op para cenas/metadados/thumbnail (fora do escopo do D-300) e para
    valores já customizados pelo canal (≠ default antigo não é tocado).
    """
    thinking_novo = _D300_THINKING_NOVO.get(cat.key)
    if thinking_novo is None:
        return
    try:
        params = json.loads(linha.get("params_json") or "{}")
    except json.JSONDecodeError:
        return
    if not isinstance(params, dict):
        return

    mudou = False
    if params.get("thinking_tokens") == _D300_THINKING_ANTIGO:
        params["thinking_tokens"] = thinking_novo
        mudou = True
    if cat.key == "cortador-expert" and params.get("timeout") == _D300_TIMEOUT_ANTIGO:
        params["timeout"] = settings.claude_cli_timeout_analise
        mudou = True
    if not mudou:
        return
    settings_store.gravar_skill(
        db,
        cid,
        cat.key,
        {
            "corpo": linha.get("corpo") or "",
            "params_json": json.dumps(params, ensure_ascii=False),
            "lentes_json": linha.get("lentes_json") or "[]",
        },
    )


def migrar_skills_do_canal_ativo(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> int:
    """Semeia no banco as skills do canal ativo que ainda não têm linha (boot) e,
    nas que já existem, roda a migração pontual do D-300 (thinking/timeout).

    Idempotente: só semeia o que falta e só migra o que ainda está no default
    antigo. Retorna quantas skills foram SEMEADAS (a migração do D-300 ajusta
    linhas já existentes e não conta para esse total). Best-effort — pensada
    para o lifespan, no mesmo espírito de `channels.migrar_identidades_para_banco`.
    """
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    existentes = settings_store.ler_skills_do_canal(db, cid)
    semeadas = 0
    for cat in _CATALOGO:
        linha = existentes.get(cat.key)
        if linha is None:
            _semear(cat, db, cid, None)
            semeadas += 1
            continue
        _migrar_linha_d300(cat, db, cid, linha)
    return semeadas
