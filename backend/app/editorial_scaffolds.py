"""
Prompts-scaffold (contrato de saída) por canal, no banco (D-297).

Emenda direta do E-021. Cada etapa de geração via Claude tem, além do CORPO da
skill (a expertise editorial — E-021), um SCAFFOLD: o invólucro que embrulha a
transcrição/meta e FIXA O FORMATO de retorno que o resto do pipeline consome
(as chaves JSON, o cabeçalho `[VARIATION_TAGS]`, etc.). Antes estavam hardcoded —
os builders `_montar_prompt*` em `services/claude_ia` e o `PROMPT_DIRECAO` de
`canal_config` (cenas). Agora são POR CANAL no banco, com o MESMO padrão do E-021:
banco-fonte-da-verdade + default versionado + seed idempotente no 1º acesso
(preservando byte-a-byte a saída atual do canal).

ARMAZENAMENTO (D-349): a tabela própria `editorial_scaffold`, uma linha por
(canal, `scaffold_key`). Antes (D-297) o scaffold morava na coluna `scaffold` da
linha `editorial_skill`, uma por `skill_key` — o que só permitia UM scaffold por
skill. Como `resumo` e `metadados` reusam ambos os params de `metadados-expert`,
não cabiam dois scaffolds na mesma linha; por isso o storage passou a ser keyed
por `scaffold_key`. O `cat.skill_key` continua sendo usado APENAS para reusar
modelo/lentes/params da skill dona (via `editorial_skills.resolver_skill`), nunca
mais como chave de armazenamento. Uma migração de boot copia os scaffolds da
coluna legada para a tabela nova, preservando as customizações existentes.

DEFAULT VERSIONADO (alvo do reset e fonte do seed): para 4 scaffolds é o template
em `examples/instance.example/editorial/scaffolds/<arquivo>.txt` (brand-neutral).
Para `cenas` é o `PROMPT_DIRECAO` resolvido pelo `channel_config_loader` (a mesma
cadeia de fallback que o código usa hoje) — assim o seed captura a direção atual
do canal e a saída não muda.

GUARDRAIL DO CONTRATO (D-297): `definir_scaffold` VALIDA antes de gravar (erro →
422 no router): todos os placeholders obrigatórios presentes, nenhum placeholder
desconhecido (que quebraria o `str.format`), sem posicionais, e o marcador do
contrato de saída presente (ex.: a chave JSON `desvios`). Um scaffold que passe
na validação é seguro de montar e mantém o formato que o pipeline espera.

Camada: config/loader (filesystem + banco de settings), o mesmo lugar de
`editorial_skills`/`editorial_identity`. A fachada de runtime (`resolver_scaffold`)
é consumida por `claude_ia`/`cenas_remotion`; a de gestão (`descrever_scaffolds`,
`definir_scaffold`, `resetar_scaffold`) alimenta a UI de Canais.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from string import Formatter

from app import channel_paths, editorial_scaffolds_legados, editorial_skills
from app.services import settings_store

# app -> backend -> raiz do repo (mesma ancoragem de editorial_skills).
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_EXEMPLO_SCAFFOLDS = _REPO_ROOT / "examples" / "instance.example" / "editorial" / "scaffolds"

# Chave interna do scaffold de cenas: o único cujo default vem do loader de
# canal_config (PROMPT_DIRECAO), não de um arquivo em scaffolds/.
_KEY_CENAS = "cenas"


@dataclass(frozen=True)
class ScaffoldCatalogo:
    """Metadados estáticos de um scaffold (não variam por canal).

    - `skill_key`: linha da tabela `editorial_skill` onde o scaffold é guardado.
    - `etapa`/`descricao`: rótulo e explicação para a UI.
    - `arquivo`: template default em `scaffolds/` (None p/ `cenas`, que usa o loader).
    - `placeholders`: os campos `{...}` OBRIGATÓRIOS que o builder injeta.
    - `opcionais`: campos `{...}` PERMITIDOS mas não obrigatórios — o builder
      sempre os injeta (valor pode vir vazio), então o scaffold pode usá-los ou
      não. Serve p/ campos que só alguns canais aproveitam (ex.: `contextualizacao`
      na abertura). `placeholders ∪ opcionais` = conjunto EXATO permitido.
    - `marcador`: token que o contrato de saída exige (checado case-insensitive).
    """

    key: str
    skill_key: str
    etapa: str
    descricao: str
    arquivo: str | None
    placeholders: tuple[str, ...]
    marcador: str
    opcionais: tuple[str, ...] = ()


# Ordem = ordem de exibição na UI.
_CATALOGO: tuple[ScaffoldCatalogo, ...] = (
    ScaffoldCatalogo(
        key="cortes",
        skill_key="cortador-expert",
        etapa="Propor cortes",
        descricao=(
            "Invólucro que envia a transcrição da live inteira e pede a lista de "
            "cortes em JSON. O corpo/expertise vem da skill 'Propor cortes'."
        ),
        arquivo="cortes.txt",
        placeholders=(
            "variacao",
            "cabecalho_section",
            "titulo_live",
            "duracao_humana",
            "youtube_url",
            "texto_transcricao",
        ),
        marcador="JSON",
    ),
    ScaffoldCatalogo(
        key="trechos",
        skill_key="trechos-expert",
        etapa="Trechos a remover (desvios)",
        descricao=(
            "Invólucro que envia um trecho do corte e pede os desvios a remover no "
            "formato JSON com a chave 'desvios'."
        ),
        arquivo="trechos.txt",
        placeholders=("cabecalho_parte", "cabecalho_meta", "texto_transcricao"),
        marcador="desvios",
    ),
    ScaffoldCatalogo(
        key=_KEY_CENAS,
        skill_key="cenas-expert",
        etapa="Cenas do vídeo",
        descricao=(
            "Direção completa de cenas (tipos, limites, formato JSON). Default vem "
            "da configuração de canal (PROMPT_DIRECAO); usado pelo caminho Gemini e "
            "Claude de geração de cenas."
        ),
        arquivo=None,
        placeholders=(
            "titulo",
            "tema_central",
            "resumo",
            "duracao_estimada",
            "legendas_numeradas",
            "max_cenas",
            "max_identidade",
            "max_fullscreen",
            "min_primeiros_15s",
        ),
        marcador="cenas",
        # B (D-295 folding): a abertura contextual pode reusar a frase que o
        # cortador-expert já produziu por corte. Opcionais: só alguns canais os usam.
        opcionais=("contextualizacao", "frase_gancho"),
    ),
    ScaffoldCatalogo(
        key="thumbnail",
        skill_key="thumbnail-prompt-expert",
        etapa="Prompt de thumbnail",
        descricao=(
            "Invólucro que envia o contexto do corte e pede o prompt de imagem da "
            "capa, com a linha [VARIATION_TAGS] e o prompt final em inglês."
        ),
        arquivo="thumbnail.txt",
        placeholders=(
            "tema",
            "titulo_youtube",
            "texto_capa",
            "resumo",
            "marca_emojis",
            "bloco_hints",
            "transcricao",
            "historico_visual",
            "mascote",
        ),
        marcador="VARIATION_TAGS",
    ),
    ScaffoldCatalogo(
        key="resumo",
        skill_key="metadados-expert",
        etapa="Resumo do corte",
        descricao=(
            "Invólucro que pede o resumo (arco de raciocínio) de um corte em JSON "
            "com a chave 'resumo'. Reusa modelo/lentes da etapa de metadados."
        ),
        arquivo="resumo.txt",
        placeholders=("variacao", "titulo", "tema", "resumo_antigo", "transcricao"),
        marcador="resumo",
    ),
    ScaffoldCatalogo(
        key="metadados",
        skill_key="metadados-expert",
        etapa="Metadados YouTube",
        descricao=(
            "Invólucro que envia o input do corte (título proposto, tema, número, "
            "resumo histórico, transcrição com marcadores [MM:SS] e títulos recentes "
            "da série) e pede os metadados em JSON. O corpo/expertise vem da skill "
            "'Metadados YouTube'."
        ),
        arquivo="metadados.txt",
        placeholders=(
            "variacao",
            "titulo_proposto",
            "tema_central",
            "numero_corte",
            "resumo_historico",
            "transcricao_marcada",
            "historico_titulos",
        ),
        marcador="JSON",
    ),
    ScaffoldCatalogo(
        key="avaliacao-bruto",
        skill_key="avaliador-bruto",
        etapa="Avaliar o bruto",
        descricao=(
            "Invólucro que envia a transcrição do bruto com as emendas marcadas e "
            "pede o parecer em JSON com nota, veredito e apontamentos. O corpo/"
            "expertise (o que conta como incoerência) vem da skill 'Avaliar o bruto'."
        ),
        arquivo="avaliacao-bruto.txt",
        placeholders=(
            "titulo",
            "tema_central",
            "duracao_humana",
            "total_emendas",
            "removido_humano",
            "tipos_apontamento",
            "texto_avaliado",
        ),
        marcador="apontamentos",
    ),
)

_CATALOGO_POR_KEY: dict[str, ScaffoldCatalogo] = {c.key: c for c in _CATALOGO}


def catalogo() -> tuple[ScaffoldCatalogo, ...]:
    """Os scaffolds do catálogo, na ordem de exibição."""
    return _CATALOGO


# D-349: mapa `skill_key → scaffold_key` do storage LEGADO (coluna
# `editorial_skill.scaffold`, uma por skill). É a base da migração de dados para a
# tabela nova: cada skill guardava exatamente UM scaffold, então `metadados-expert`
# aponta para `resumo` (o único scaffold que ali morava antes do D-349) — o novo
# `metadados` nasce direto na tabela nova, sem dado legado a migrar.
_MAPA_MIGRACAO_LEGADO: dict[str, str] = {
    "cortador-expert": "cortes",
    "trechos-expert": "trechos",
    "cenas-expert": _KEY_CENAS,
    "thumbnail-prompt-expert": "thumbnail",
    "metadados-expert": "resumo",
}


def _exigir_catalogo(scaffold_key: str) -> ScaffoldCatalogo:
    cat = _CATALOGO_POR_KEY.get(scaffold_key)
    if cat is None:
        raise KeyError(f"Scaffold desconhecido: {scaffold_key!r}.")
    return cat


# --------------------------------------------------------------------------- #
# Default versionado (alvo do reset e fonte do seed)
# --------------------------------------------------------------------------- #


def _default_scaffold(cat: ScaffoldCatalogo) -> str:
    """Texto default do scaffold: arquivo versionado, ou PROMPT_DIRECAO p/ cenas."""
    if cat.key == _KEY_CENAS:
        # Import tardio: evita custo de resolver o canal_config no import do módulo.
        from app import channel_config_loader

        return channel_config_loader.PROMPT_DIRECAO.strip()
    caminho = _EXEMPLO_SCAFFOLDS / (cat.arquivo or "")
    if not caminho.is_file():
        return ""
    return caminho.read_text(encoding="utf-8").strip()


# --------------------------------------------------------------------------- #
# Guardrail do contrato de saída
# --------------------------------------------------------------------------- #


def _campos_do_template(template: str) -> set[str]:
    """Nomes de placeholder usados no template (base, sem índices/atributos).

    `{a.b}`/`{a[0]}` contam como `a`; `{}`/`{0}` retornam nome vazio/dígito, que a
    validação rejeita (posicionais quebrariam o `.format(**kwargs)`).
    """
    campos: set[str] = set()
    for _, nome, _, _ in Formatter().parse(template):
        if nome is None:
            continue
        campos.add(nome.split(".")[0].split("[")[0])
    return campos


def validar_scaffold(template: str, cat: ScaffoldCatalogo) -> None:
    """Valida o scaffold contra o contrato da etapa; levanta `ValueError` se inválido.

    Regras: chaves balanceadas, só placeholders nomeados, TODOS os obrigatórios
    presentes, NENHUM desconhecido (quebraria o `.format`) e o marcador do contrato
    presente. Um template que passa aqui é seguro de montar em runtime.
    """
    try:
        campos = _campos_do_template(template)
    except (ValueError, IndexError) as e:
        raise ValueError(f"Template mal-formado (chaves {{ }} desbalanceadas?): {e}") from e

    if any(nome == "" or nome.isdigit() for nome in campos):
        raise ValueError(
            "Use apenas placeholders NOMEADOS, ex. {texto_transcricao}; "
            "posicionais ({} ou {0}) não são suportados."
        )

    obrigatorios = set(cat.placeholders)
    faltando = obrigatorios - campos
    if faltando:
        raise ValueError(
            "O scaffold precisa conter os placeholders obrigatórios: "
            + ", ".join("{" + p + "}" for p in sorted(faltando))
            + "."
        )
    permitidos = obrigatorios | set(cat.opcionais)
    desconhecidos = campos - permitidos
    if desconhecidos:
        raise ValueError(
            "Placeholders desconhecidos (quebrariam a montagem): "
            + ", ".join("{" + p + "}" for p in sorted(desconhecidos))
            + ". Permitidos: "
            + ", ".join("{" + p + "}" for p in (*cat.placeholders, *cat.opcionais))
            + "."
        )
    if cat.marcador and cat.marcador.lower() not in template.lower():
        raise ValueError(
            f"O contrato de saída exige o marcador '{cat.marcador}' no scaffold "
            "(mantê-lo garante que o retorno siga o formato que o pipeline consome)."
        )


# --------------------------------------------------------------------------- #
# Resolução por canal (banco → seed a partir do default versionado)
# --------------------------------------------------------------------------- #


def _resolver_db_e_canal(db_path: Path | None, channel_id: str | None) -> tuple[Path, str]:
    db = db_path if db_path is not None else channel_paths.settings_db_path()
    cid = channel_id if channel_id is not None else channel_paths.active_channel_root().name
    return db, cid


def resolver_scaffold(
    scaffold_key: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> str:
    """Resolve o scaffold do canal ATIVO — banco como fonte da verdade (D-297).

    Ordem (espelha `editorial_skills.resolver_skill`):
      1. Garante que a linha da skill DONA esteja SEMEADA (corpo/params/lentes do
         E-021) — a etapa reusa modelo/lentes dela; o scaffold em si mora à parte.
      2. BANCO (tabela `editorial_scaffold`, keyed por `scaffold_key`): se há
         scaffold gravado, é a fonte da verdade.
      3. Sem scaffold (linha ausente ou vazia) → SEMEIA a partir do default
         versionado e devolve. A partir daí o banco basta.

    Nunca lança no caminho feliz. Os kwargs isolam testes do `instance/` real.
    """
    cat = _exigir_catalogo(scaffold_key)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    editorial_skills.resolver_skill(
        cat.skill_key, db_path=db, channel_id=cid, editorial_root=editorial_root
    )
    atual = settings_store.ler_scaffold(db, cid, cat.key)
    if not atual:
        default = _default_scaffold(cat)
        settings_store.gravar_scaffold(db, cid, cat.key, default)
        return default
    return atual


# --------------------------------------------------------------------------- #
# Fachada de gestão (UI de Canais): valor-do-canal + default, editar, resetar
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class ScaffoldDescrito:
    """Scaffold para a UI: metadados + valor-do-canal + default (alvo do reset)."""

    key: str
    etapa: str
    descricao: str
    scaffold: str
    scaffold_default: str
    placeholders: list[str]
    marcador: str


def _descrever(cat: ScaffoldCatalogo, scaffold: str) -> ScaffoldDescrito:
    return ScaffoldDescrito(
        key=cat.key,
        etapa=cat.etapa,
        descricao=cat.descricao,
        scaffold=scaffold,
        scaffold_default=_default_scaffold(cat),
        placeholders=list(cat.placeholders),
        marcador=cat.marcador,
    )


def descrever_scaffolds(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> list[ScaffoldDescrito]:
    """Os scaffolds do canal ativo com valor-do-canal + default, para a UI."""
    return [
        _descrever(
            cat,
            resolver_scaffold(
                cat.key, db_path=db_path, channel_id=channel_id, editorial_root=editorial_root
            ),
        )
        for cat in _CATALOGO
    ]


def definir_scaffold(
    scaffold_key: str,
    scaffold: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> ScaffoldDescrito:
    """Edita o scaffold do canal ativo pela UI, VALIDANDO o contrato antes de gravar.

    Levanta `ValueError` (→ 422) se o scaffold não passar no guardrail. Grava no
    banco (fonte da verdade) na linha da skill correspondente e devolve o scaffold
    descrito (valor-do-canal + default).
    """
    cat = _exigir_catalogo(scaffold_key)
    validar_scaffold(scaffold, cat)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    # Garante a linha da skill dona semeada (E-021 — modelo/lentes reusados).
    editorial_skills.resolver_skill(
        cat.skill_key, db_path=db, channel_id=cid, editorial_root=editorial_root
    )
    settings_store.gravar_scaffold(db, cid, cat.key, scaffold)
    return _descrever(
        cat,
        resolver_scaffold(scaffold_key, db_path=db, channel_id=cid, editorial_root=editorial_root),
    )


def resetar_scaffold(
    scaffold_key: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> ScaffoldDescrito:
    """Restaura o scaffold ao DEFAULT versionado (reset-para-o-padrão)."""
    cat = _exigir_catalogo(scaffold_key)
    return definir_scaffold(
        scaffold_key,
        _default_scaffold(cat),
        db_path=db_path,
        channel_id=channel_id,
        editorial_root=editorial_root,
    )


# --------------------------------------------------------------------------- #
# Migração pontual de boot (D-330): scaffold concreto V1 superado → default v2
# --------------------------------------------------------------------------- #


def migrar_scaffolds_do_canal_ativo(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    editorial_root: Path | None = None,
) -> int:
    """Troca, no boot, o scaffold concreto V1 superado pelo DEFAULT versionado atual.

    Espelha `editorial_skills._migrar_corpo_v2_concreto` (D-311), mas para o
    SCAFFOLD por canal: `claude_ia` monta o prompt como `expertise + scaffold`, e o
    scaffold concreto pré-D-330 (conservador, 2 tipos) DOMINAVA o corpo v2. Aqui o
    scaffold gravado é substituído pelo novo default magro — SÓ quando bate EXATO
    com um superado conhecido (`SCAFFOLDS_SUPERADOS`). Scaffold customizado ou já
    no novo default não bate e é preservado; idempotente.

    Best-effort — pensada para rodar no MESMO ponto de boot que
    `editorial_skills.migrar_skills_do_canal_ativo`. Retorna quantos scaffolds
    foram migrados. `editorial_root`/kwargs isolam testes do `instance/` real.

    D-349: ANTES de qualquer coisa, move os scaffolds da coluna legada
    (`editorial_skill.scaffold`, keyed por skill) para a tabela própria
    (`editorial_scaffold`, keyed por scaffold_key) — assim um scaffold V1 já
    customizado é migrado primeiro e a troca V1→v2 abaixo o enxerga na tabela nova.
    """
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    settings_store.migrar_scaffolds_para_tabela_propria(db, _MAPA_MIGRACAO_LEGADO)
    migrados = 0
    for cat in _CATALOGO:
        superados = editorial_scaffolds_legados.SCAFFOLDS_SUPERADOS.get(cat.skill_key)
        if not superados:
            continue
        atual = settings_store.ler_scaffold(db, cid, cat.key)
        if not atual or atual.strip() not in superados:
            continue
        settings_store.gravar_scaffold(db, cid, cat.key, _default_scaffold(cat))
        migrados += 1
    return migrados
