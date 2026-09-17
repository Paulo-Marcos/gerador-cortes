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
      sem lentes — trechos/thumbnail (consistência/anti-mode-collapse) e cortes
      (D-301: o ângulo de titulação deriva do conteúdo de cada corte, não de
      um cardápio sorteado) por design).

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
            "a descartar. É o primeiro passo do pipeline de análise. Sem lentes de "
            "sorteio por design (D-301): a variação do ângulo do título nasce do "
            "conteúdo de cada corte, não de um cardápio sorteado."
        ),
        model_setting="claude_model_analise",
        thinking_setting="claude_cli_thinking_tokens_analise",
        timeout_setting="claude_cli_timeout_analise",
        lentes_tipo=None,
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
    SkillCatalogo(
        key="avaliador-bruto",
        arquivo="avaliacao-bruto.md",
        etapa="Avaliar o bruto",
        descricao=(
            "Lê o bruto pronto — a transcrição já sem os trechos removidos, com "
            "as emendas marcadas — e devolve nota, veredito estrutural e os "
            "pontos que não fecham. Roda sozinha ao fim de cada geração de "
            "bruto; a série de notas alimenta o refino da skill 'Propor cortes'. "
            "Sem lentes por design: avaliação precisa ser comparável entre "
            "cortes, não variada."
        ),
        model_setting="claude_model_avaliacao",
        thinking_setting="claude_cli_thinking_tokens_avaliacao",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="shorts-expert",
        arquivo="shorts.md",
        etapa="Propor shorts",
        descricao=(
            "Le a transcricao do bruto de um corte marcado com Fire e propoe os "
            "trechos que funcionam sozinhos como video vertical (inicio/fim, "
            "titulo, gancho, nota e justificativa). Roda automaticamente ao fim "
            "da geracao do bruto dos Fires; a curadoria acontece depois, na tela "
            "de Shorts. Sem lentes por design: a selecao precisa ser comparavel "
            "entre cortes, nao variada."
        ),
        model_setting="claude_model_shorts",
        thinking_setting="claude_cli_thinking_tokens_shorts",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="capa-tiktok-expert",
        arquivo="capa-tiktok.md",
        etapa="Etiqueta da capa do TikTok",
        descricao=(
            "Escreve as 2-3 palavras que vao no alto da capa vertical do corte "
            "no TikTok. Nao e a manchete: a thumb do YouTube e um cartaz que "
            "disputa o clique numa lista, e a capa do TikTok e a vitrine do "
            "perfil, onde nove capas sao vistas juntas. A imagem em si e MONTADA "
            "pelo sistema, sempre no mesmo layout — esta skill entrega so o "
            "texto. Sem lentes por design, e pelo motivo inverso ao da capa do "
            "YouTube: aqui repetir o assunto entre cortes e o que da coerencia a "
            "grade."
        ),
        model_setting="claude_model_capa_tiktok",
        thinking_setting="claude_cli_thinking_tokens_capa_tiktok",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="capa-tiktok-imagem-expert",
        arquivo="capa-tiktok-imagem.md",
        etapa="Arte da capa do TikTok",
        descricao=(
            "Escreve o prompt de imagem da faixa central da capa vertical. A "
            "diferenca para o capista do YouTube e que aqui a imagem NAO leva "
            "texto: a etiqueta e o selo sao desenhados por cima, com a "
            "tipografia do canal. A cena tambem precisa de um unico ponto de "
            "interesse — na grade do perfil a capa chega a menos de um terco da "
            "largura da tela, e composicao detalhada some."
        ),
        model_setting="claude_model_capa_tiktok_imagem",
        thinking_setting="claude_cli_thinking_tokens_capa_tiktok_imagem",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="capa-short-imagem-expert",
        arquivo="capa-short-imagem.md",
        etapa="Capa do short",
        descricao=(
            "Escreve o prompt de imagem da capa de um short vertical. A "
            "diferenca para o capista do TikTok e que aqui a imagem LEVA o "
            "texto: a capa do short nao e montada em faixas pelo sistema, "
            "entao a frase precisa nascer dentro da arte, com cor e contorno "
            "declarados. E a composicao tem de sobreviver a TRES recortes — a "
            "grade do Instagram e a do TikTok mostram so o quadrado central."
        ),
        model_setting="claude_model_capa_short",
        thinking_setting="claude_cli_thinking_tokens_capa_short",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="cenas-short-expert",
        arquivo="cenas-short.md",
        etapa="Propor cenas do short",
        descricao=(
            "Le a transcricao de UM trecho vertical ja escolhido e propoe os "
            "cartoes que entram por cima do video: gancho, numero, citacao e "
            "chamada. Roda sob demanda, na tela de Shorts, depois de o operador "
            "aprovar o trecho. Separada de 'Gerar cenas' porque o repertorio e "
            "outro: la sao fichas e enfases num video de 10 minutos, aqui sao "
            "quatro cartoes disputando 30 segundos de tela vertical."
        ),
        model_setting="claude_model_cenas_short",
        thinking_setting="claude_cli_thinking_tokens_cenas_short",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="gancho-short-expert",
        arquivo="gancho-short.md",
        etapa="Gancho da abertura do short",
        descricao=(
            "Escreve as variacoes do texto que aparece nos primeiros segundos de "
            "um short e some antes dos tres — o que faz a promessa chegar a quem "
            "assiste sem som. Le a transcricao do TRECHO, nao o resumo do corte: "
            "gancho que promete o que o short nao entrega gera abandono no "
            "segundo 10. Nao confundir com a etiqueta da capa do TikTok: la sao "
            "2-3 palavras nomeando o assunto numa prateleira, e repetir e bom; "
            "aqui e uma frase de 4-7 palavras que abre uma pergunta, e repetir "
            "entre shorts parece robo no feed."
        ),
        model_setting="claude_model_gancho_short",
        thinking_setting="claude_cli_thinking_tokens_gancho_short",
        lentes_tipo=None,
    ),
    SkillCatalogo(
        key="metadados-short-expert",
        arquivo="metadados-short.md",
        etapa="Post do short",
        descricao=(
            "Escreve o titulo, a descricao e as hashtags que acompanham o short "
            "no feed — nao o texto que aparece DENTRO do video, que e o gancho. "
            "Separada dos 'Metadados YouTube' porque os leitores sao outros: la "
            "o titulo e um cartaz que disputa o clique numa lista de resultados; "
            "aqui ele e lido por quem JA parou, com ~40 caracteres visiveis, e "
            "vira a primeira linha da legenda no TikTok e no Instagram, que nao "
            "tem campo de titulo."
        ),
        model_setting="claude_model_metadados_short",
        thinking_setting="claude_cli_thinking_tokens_metadados_short",
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
    # Modelo do provider "Gemini" (Antigravity CLI). O default vazio só existe para
    # quem constrói a skill à mão; a resolução pelo banco sempre preenche.
    modelo_gemini: str = ""


def catalogo() -> tuple[SkillCatalogo, ...]:
    """As skills editoriais do canal, na ordem de exibição."""
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


def modelo_gemini_equivalente(modelo_claude: str) -> str:
    """Modelo Gemini padrão para a faixa do modelo Claude da skill.

    Haiku é escolha de rapidez → modelo rápido; Opus e Sonnet são de qualidade →
    modelo de qualidade. É só o PADRÃO: cada skill troca na tela de Canais.
    """
    if "haiku" in (modelo_claude or "").lower():
        return settings.agy_model_rapido
    return settings.agy_model_qualidade


def _default_params(cat: SkillCatalogo) -> dict:
    """Params default a partir dos globais de `config.settings`."""
    modelo = str(getattr(settings, cat.model_setting))
    return {
        "modelo": modelo,
        "modelo_gemini": modelo_gemini_equivalente(modelo),
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
    modelo = str(raw.get("modelo") or defaults["modelo"])
    return {
        "modelo": modelo,
        # Linhas gravadas antes do Antigravity não têm o campo: derivam do Claude.
        "modelo_gemini": str(raw.get("modelo_gemini") or modelo_gemini_equivalente(modelo)),
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
        modelo_gemini=params["modelo_gemini"],
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
    """As skills do catálogo, resolvidas no canal ativo, para a UI."""
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
        "modelo_gemini": resolvida.modelo_gemini,
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
# Histórico de versões (D-312): auditar o que mudou e reverter (append-only)
# --------------------------------------------------------------------------- #


# Rótulos legíveis dos campos versionados, para o "resumo do que mudou" na UI.
_ROTULO_CAMPO: dict[str, str] = {
    "corpo": "prompt",
    "params_json": "parâmetros",
    "lentes_json": "lentes",
    "scaffold": "contrato de saída",
}


@dataclass(frozen=True)
class SkillVersaoDescrita:
    """Uma versão da skill para a UI de histórico (D-312).

    `mudancas` lista os campos que diferem da versão IMEDIATAMENTE anterior (a de
    número `versao - 1`); `resumo` é a forma legível — "Versão inicial" na v1, ou
    os rótulos dos campos alterados. `vigente` marca a versão atualmente em uso.
    """

    versao: int
    criado_em: str
    vigente: bool
    resumo: str
    mudancas: list[str]


def _diff_versoes(anterior: dict | None, atual: dict) -> list[str]:
    """Campos de conteúdo que mudaram de `anterior` para `atual` (ordem estável).

    Sem anterior (primeira versão) → lista vazia (o chamador rotula como inicial).
    """
    if anterior is None:
        return []
    return [campo for campo in _ROTULO_CAMPO if anterior.get(campo) != atual.get(campo)]


def _resumo_mudancas(mudancas: list[str], eh_inicial: bool) -> str:
    if eh_inicial:
        return "Versão inicial"
    if not mudancas:
        return "Sem alterações de conteúdo"
    return ", ".join(_ROTULO_CAMPO[campo] for campo in mudancas)


def listar_versoes(
    skill_key: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> list[SkillVersaoDescrita]:
    """Histórico de versões da skill do canal ativo, da mais nova para a mais antiga.

    Computa, para cada versão, o que mudou em relação à anterior — o diff é feito
    aqui (serviço), não no store, porque depende do vocabulário de campos da skill.
    """
    _exigir_catalogo(skill_key)  # valida a key (KeyError → 404 no router)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    linhas = settings_store.listar_versoes_skill(db, cid, skill_key)
    por_versao = {linha["versao"]: linha for linha in linhas}
    descritas: list[SkillVersaoDescrita] = []
    for linha in linhas:  # já em ordem decrescente
        anterior = por_versao.get(linha["versao"] - 1)
        eh_inicial = linha["versao"] == 1 or anterior is None
        mudancas = _diff_versoes(anterior, linha)
        descritas.append(
            SkillVersaoDescrita(
                versao=int(linha["versao"]),
                criado_em=str(linha["criado_em"] or ""),
                vigente=bool(linha["vigente"]),
                resumo=_resumo_mudancas(mudancas, eh_inicial),
                mudancas=mudancas,
            )
        )
    return descritas


def reverter_skill(
    skill_key: str,
    versao: int,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> SkillDescrita:
    """Reverte a skill do canal ativo ao conteúdo de `versao` (append-only) e
    devolve a skill já descrita (valor-do-canal + default).

    Delega o append-only ao store; aqui só espelha o corpo revertido no `.md`
    (mesma coerência banco↔espelho de `definir_skill`) e re-descreve. `KeyError`
    da versão inexistente sobe para o router mapear como 404.
    """
    cat = _exigir_catalogo(skill_key)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    revertido = settings_store.reverter_skill_para_versao(db, cid, skill_key, versao)
    _espelhar_corpo_no_md(cat, str(revertido.get("corpo") or "").strip(), editorial_root)
    return _descrever(
        cat, resolver_skill(skill_key, db_path=db, channel_id=cid, editorial_root=editorial_root)
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


# --------------------------------------------------------------------------- #
# Migração pontual D-301: lentes de sorteio removidas da etapa cortes — canais
# que já tinham a linha semeada com o repertório ANTIGO (as 4 frases de
# sorteio) são zerados. Comparar contra a lista ANTIGA — nunca "zerar sempre"
# — preserva qualquer lente customizada pelo canal via UI de Canais.
# --------------------------------------------------------------------------- #

_D301_LENTES_CORTES_ANTIGO: list[str] = [
    "Favoreça títulos que destacam a TESE PROVOCATIVA de cada corte.",
    "Favoreça títulos centrados no CONCEITO-CHAVE de cada corte.",
    "Favoreça títulos que apontam a CONSEQUÊNCIA PRÁTICA do argumento.",
    "Favoreça títulos em forma de PERGUNTA que fisga o espectador.",
]


def _migrar_linha_d301(cat: SkillCatalogo, db: Path, cid: str, linha: dict) -> None:
    """Zera `lentes_json` de cortador-expert quando a linha JÁ existente ainda
    tem o repertório de sorteio ANTIGO (D-301: a variação do título passa a
    derivar do conteúdo de cada corte, não de sorteio).

    No-op para as demais skills e para lentes já customizadas pelo canal
    (qualquer lista ≠ default antigo não é tocada).
    """
    if cat.key != "cortador-expert":
        return
    try:
        lentes = json.loads(linha.get("lentes_json") or "[]")
    except json.JSONDecodeError:
        return
    if lentes != _D301_LENTES_CORTES_ANTIGO:
        return
    settings_store.gravar_skill(
        db,
        cid,
        cat.key,
        {
            "corpo": linha.get("corpo") or "",
            "params_json": linha.get("params_json") or "{}",
            "lentes_json": json.dumps([], ensure_ascii=False),
        },
    )


def migrar_skills_do_canal_ativo(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> int:
    """Semeia no banco as skills do canal ativo que ainda não têm linha (boot) e,
    nas que já existem, roda as migrações pontuais D-300 (thinking/timeout),
    D-301 (lentes de cortes) e D-311 (corpo concreto pré-v2 → v2 concreto).

    Idempotente: só semeia o que falta e só migra o que ainda está num default
    superado. Retorna quantas skills foram SEMEADAS (as migrações pontuais
    ajustam linhas já existentes e não contam para esse total). Best-effort —
    pensada para o lifespan, no mesmo espírito de
    `channels.migrar_identidades_para_banco`. `editorial_root` isola testes do
    `instance/` real (default = diretório editorial do canal ativo).
    """
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    existentes = settings_store.ler_skills_do_canal(db, cid)
    semeadas = 0
    for cat in _CATALOGO:
        linha = existentes.get(cat.key)
        if linha is None:
            _semear(cat, db, cid, editorial_root)
            semeadas += 1
            continue
        _migrar_linha_d300(cat, db, cid, linha)
        # Relê após cada migração: uma pode ter reescrito params_json/lentes_json
        # da MESMA linha (cortador-expert é alcançado por todas) — a próxima deve
        # gravar sobre o estado JÁ migrado, não sobre a linha stale.
        linha = settings_store.ler_skill(db, cid, cat.key) or linha
        _migrar_linha_d301(cat, db, cid, linha)

    # D-330: no MESMO ponto de boot, alinha o scaffold concreto V1 (conservador)
    # ao default v2 magro. Import tardio evita o ciclo (editorial_scaffolds importa
    # editorial_skills no topo). Best-effort: um erro aqui não deve falhar o seed.
    from app import editorial_scaffolds

    editorial_scaffolds.migrar_scaffolds_do_canal_ativo(
        db_path=db, channel_id=cid, editorial_root=editorial_root
    )
    return semeadas
