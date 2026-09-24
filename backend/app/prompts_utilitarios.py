"""Prompts utilitários por canal, no banco (D-348).

Dois prompts de IA (Claude) que antes viviam HARDCODED em strings Python e eram
invisíveis nas Configurações do canal:

  - `sentimento-ranking` (`services/ranking_lives`): analisa o tom dos comentários
    de uma live candidata e devolve um score 0-10 + destaques.
  - `padroes-thumbnail` (`services/padroes_thumbnail`): lê os prompts de thumbnail
    melhor avaliados e propõe um ajuste na skill do Capista.

Diferente dos SCAFFOLDS (contrato de saída das etapas do pipeline de corte,
`editorial_scaffolds`), estes são prompts UTILITÁRIOS — auxiliares, fora do
pipeline de corte. São modelados à parte para não poluir a seção de scaffolds na
UI, mas seguem a MESMA mecânica do E-021/D-297: banco-fonte-da-verdade + default
versionado + seed idempotente no 1º acesso (preservando byte-a-byte a saída
atual). Apenas o TEMPLATE é editável por canal; o MODELO do Claude continua vindo
de `settings` (fora do escopo desta demanda).

ARMAZENAMENTO: reusa a tabela genérica `editorial_scaffold` (channel_id,
scaffold_key, template) via `settings_store.ler_scaffold`/`gravar_scaffold` — ela
é keyed por chave genérica de texto, então as chaves `sentimento-ranking` e
`padroes-thumbnail` convivem ao lado dos scaffolds sem colidir. Não se criou uma
tabela nova: a estrutura (uma linha por canal+chave de template de texto) é
idêntica à que os scaffolds já usam; uma tabela paralela seria duplicação de
schema sem ganho.

GUARDRAIL: reusa `editorial_scaffolds.validar_scaffold` — o catálogo aqui expõe os
mesmos campos que ela lê (`placeholders`/`opcionais`/`marcador`), então a mesma
validação de contrato (todos os obrigatórios presentes, nenhum desconhecido que
quebraria o `str.format`, marcador presente) vale para os prompts utilitários.

Camada: config/loader (filesystem + banco de settings), o mesmo lugar de
`editorial_scaffolds`. A fachada de runtime (`resolver_prompt`) é consumida pelos
serviços; a de gestão (`descrever_prompts`, `definir_prompt`, `resetar_prompt`)
alimenta a UI de Canais.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app import channel_paths, editorial_scaffolds
from app.infrastructure import settings_store

# app -> backend -> raiz do repo (mesma ancoragem de editorial_scaffolds).
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_EXEMPLO_PROMPTS = _REPO_ROOT / "examples" / "instance.example" / "editorial" / "prompts"


@dataclass(frozen=True)
class PromptUtilitario:
    """Metadados estáticos de um prompt utilitário (não variam por canal).

    - `etapa`/`descricao`: rótulo e explicação para a UI.
    - `arquivo`: template default em `prompts/`.
    - `placeholders`: os campos `{...}` OBRIGATÓRIOS que o serviço injeta.
    - `opcionais`: campos `{...}` PERMITIDOS mas não obrigatórios.
    - `marcador`: token que o contrato de saída exige (checado case-insensitive).
    - `modelo_setting`: nome do atributo em `app.config.settings` que define o
      modelo do Claude usado (informativo — o modelo NÃO é editável por canal).

    Os campos `placeholders`/`opcionais`/`marcador` espelham `ScaffoldCatalogo`
    de propósito, para reusar `editorial_scaffolds.validar_scaffold` como guardrail.
    """

    key: str
    etapa: str
    descricao: str
    arquivo: str
    placeholders: tuple[str, ...]
    marcador: str
    modelo_setting: str
    opcionais: tuple[str, ...] = ()


# Ordem = ordem de exibição na UI.
_CATALOGO: tuple[PromptUtilitario, ...] = (
    PromptUtilitario(
        key="sentimento-ranking",
        etapa="Sentimento dos comentários (ranking de lives)",
        descricao=(
            "Analisa o tom dos comentários do público de uma live candidata e "
            "devolve um score 0-10 + destaques, usado para pontuar o ranking de "
            "lives. Os comentários computados entram em {comentarios}."
        ),
        arquivo="sentimento-ranking.txt",
        placeholders=("comentarios",),
        marcador="JSON",
        modelo_setting="claude_model_ranking_sentimento",
    ),
    PromptUtilitario(
        key="padroes-thumbnail",
        etapa="Padrões dos melhores thumbnails",
        descricao=(
            "Lê os prompts de thumbnail melhor avaliados do canal e propõe um "
            "ajuste na skill do Capista. Os dados computados entram em "
            "{total_melhores}, {com_tags}, {eixos} e {exemplos}."
        ),
        arquivo="padroes-thumbnail.txt",
        placeholders=("total_melhores", "com_tags", "eixos", "exemplos"),
        marcador="JSON",
        modelo_setting="claude_model_metadados",
    ),
)

_CATALOGO_POR_KEY: dict[str, PromptUtilitario] = {c.key: c for c in _CATALOGO}


def catalogo() -> tuple[PromptUtilitario, ...]:
    """Os prompts utilitários do catálogo, na ordem de exibição."""
    return _CATALOGO


def _exigir_catalogo(key: str) -> PromptUtilitario:
    cat = _CATALOGO_POR_KEY.get(key)
    if cat is None:
        raise KeyError(f"Prompt utilitário desconhecido: {key!r}.")
    return cat


# --------------------------------------------------------------------------- #
# Default versionado (alvo do reset e fonte do seed)
# --------------------------------------------------------------------------- #


def _default_prompt(cat: PromptUtilitario) -> str:
    """Texto default do prompt: arquivo versionado em `prompts/`."""
    caminho = _EXEMPLO_PROMPTS / cat.arquivo
    if not caminho.is_file():
        return ""
    return caminho.read_text(encoding="utf-8").strip()


# --------------------------------------------------------------------------- #
# Guardrail do contrato de saída (reusa o de editorial_scaffolds)
# --------------------------------------------------------------------------- #


def validar_prompt(template: str, cat: PromptUtilitario) -> None:
    """Valida o template contra o contrato do prompt; levanta `ValueError` se inválido.

    Delega ao guardrail dos scaffolds: `PromptUtilitario` expõe os mesmos campos
    (`placeholders`/`opcionais`/`marcador`) que `validar_scaffold` lê, então a
    mesma regra vale — todos os obrigatórios presentes, nenhum desconhecido
    (quebraria o `.format`), sem posicionais e o marcador presente.
    """
    editorial_scaffolds.validar_scaffold(template, cat)


# --------------------------------------------------------------------------- #
# Resolução por canal (banco → seed a partir do default versionado)
# --------------------------------------------------------------------------- #


def _resolver_db_e_canal(db_path: Path | None, channel_id: str | None) -> tuple[Path, str]:
    db = db_path if db_path is not None else channel_paths.settings_db_path()
    cid = channel_id if channel_id is not None else channel_paths.active_channel_root().name
    return db, cid


def resolver_prompt(
    key: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> str:
    """Resolve o prompt do canal ATIVO — banco como fonte da verdade (D-348).

    Ordem (espelha `editorial_scaffolds.resolver_scaffold`, sem a linha de skill):
      1. BANCO (tabela `editorial_scaffold`, keyed por `key`): se há template
         gravado, é a fonte da verdade.
      2. Sem template (linha ausente ou vazia) → SEMEIA a partir do default
         versionado e devolve. A partir daí o banco basta.

    Nunca lança no caminho feliz. Os kwargs isolam testes do `instance/` real.
    """
    cat = _exigir_catalogo(key)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    atual = settings_store.ler_scaffold(db, cid, cat.key)
    if not atual:
        default = _default_prompt(cat)
        settings_store.gravar_scaffold(db, cid, cat.key, default)
        return default
    return atual


# --------------------------------------------------------------------------- #
# Fachada de gestão (UI de Canais): valor-do-canal + default, editar, resetar
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class PromptDescrito:
    """Prompt para a UI: metadados + valor-do-canal + default (alvo do reset)."""

    key: str
    etapa: str
    descricao: str
    prompt: str
    prompt_default: str
    placeholders: list[str]
    marcador: str


def _descrever(cat: PromptUtilitario, prompt: str) -> PromptDescrito:
    return PromptDescrito(
        key=cat.key,
        etapa=cat.etapa,
        descricao=cat.descricao,
        prompt=prompt,
        prompt_default=_default_prompt(cat),
        placeholders=list(cat.placeholders),
        marcador=cat.marcador,
    )


def descrever_prompts(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> list[PromptDescrito]:
    """Os prompts utilitários do canal ativo com valor-do-canal + default, para a UI."""
    return [
        _descrever(cat, resolver_prompt(cat.key, db_path=db_path, channel_id=channel_id))
        for cat in _CATALOGO
    ]


def definir_prompt(
    key: str,
    template: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> PromptDescrito:
    """Edita o prompt do canal ativo pela UI, VALIDANDO o contrato antes de gravar.

    Levanta `ValueError` (→ 422) se o template não passar no guardrail. Grava no
    banco (fonte da verdade) e devolve o prompt descrito (valor-do-canal + default).
    """
    cat = _exigir_catalogo(key)
    validar_prompt(template, cat)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    settings_store.gravar_scaffold(db, cid, cat.key, template)
    return _descrever(cat, resolver_prompt(key, db_path=db, channel_id=cid))


def resetar_prompt(
    key: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> PromptDescrito:
    """Restaura o prompt ao DEFAULT versionado (reset-para-o-padrão)."""
    cat = _exigir_catalogo(key)
    return definir_prompt(key, _default_prompt(cat), db_path=db_path, channel_id=channel_id)
