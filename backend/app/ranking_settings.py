"""Pesos e critérios do ranking de lives por canal, no banco (D-351).

Os 5 pesos que combinam os sinais de uma live candidata (views, likes por view,
comentários por view, sentimento dos comentários, recência) e a meia-vida do decay
de recência viviam SÓ como settings de `.env` — invisíveis e não-editáveis na UI.
Aqui eles passam a ser POR CANAL no banco, com o MESMO padrão do E-021:
banco-fonte-da-verdade + default versionado (os `ranking_*` de `config.settings`) +
seed idempotente no 1º acesso (preservando o comportamento atual do canal).

O DOMÍNIO (`domain/ranking_lives.PesosRanking`) segue PURO — não lê settings nem
banco. Este módulo é a camada config/loader que resolve o valor do canal e injeta
no dataclass, no mesmo lugar de `editorial_scaffolds`/`prompts_utilitarios`. A
fachada de runtime (`resolver_pesos`) é consumida pelo serviço `ranking_lives`; a de
gestão (`descrever_pesos`, `definir_pesos`, `resetar_pesos`) alimenta a UI de Canais.

ARMAZENAMENTO: a tabela própria `ranking_pesos` (uma linha por canal) via
`settings_store.ler_ranking_pesos`/`gravar_ranking_pesos`. Uma tabela nova (e não a
genérica dos scaffolds de texto) porque os pesos são numéricos e estruturados —
seis colunas REAL, não um blob de template.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app import channel_paths
from app.config import settings
from app.domain.live_candidata.ranking_lives import PesosRanking
from app.infrastructure import settings_store

# As 5 chaves que são PESOS (entram no reescalonamento 0-100). `meia_vida_dias` é um
# PARÂMETRO do decay de recência, não um peso — validado à parte (deve ser > 0).
_CHAVES_PESO: tuple[str, ...] = (
    "views",
    "likes_por_view",
    "comentarios_por_view",
    "sentimento",
    "recencia",
    "vph",
)
_CHAVE_MEIA_VIDA = "meia_vida_dias"
_TODAS_CHAVES: tuple[str, ...] = (*_CHAVES_PESO, _CHAVE_MEIA_VIDA)


@dataclass(frozen=True)
class CriterioRanking:
    """Metadados estáticos de um critério do ranking (não variam por canal).

    - `rotulo`/`descricao`: o que a UI mostra para deixar CLARO cada critério.
    - `eh_peso`: True para os 5 pesos (participam do reescalonamento); False para a
      meia-vida (parâmetro do decay). Guia a validação e a UI.
    """

    key: str
    rotulo: str
    descricao: str
    eh_peso: bool


# Ordem = ordem de exibição na UI. Ordenada pela filosofia do dono (D-356): o que
# o público genuinamente curtiu vem primeiro; audiência bruta por último.
_CRITERIOS: tuple[CriterioRanking, ...] = (
    CriterioRanking(
        key="sentimento",
        rotulo="Positividade dos comentários (o público disse que foi bom?)",
        descricao=(
            "Quanto pesa o tom dos comentários (score 0-10 avaliado pelo Claude). "
            "Alto = público entusiasmado; baixo = rejeição. O sinal mais forte do "
            "que o público genuinamente curtiu."
        ),
        eh_peso=True,
    ),
    CriterioRanking(
        key="comentarios_por_view",
        rotulo="Engajamento de comentários (quantos comentaram, por view)",
        descricao=(
            "Quanto pesa a TAXA de comentários por visualização — quanta conversa a "
            "live gerou em relação ao seu alcance."
        ),
        eh_peso=True,
    ),
    CriterioRanking(
        key="likes_por_view",
        rotulo="Likes (% das views)",
        descricao=(
            "Quanto pesa a TAXA de likes por visualização — engajamento relativo, "
            "não o número absoluto de likes."
        ),
        eh_peso=True,
    ),
    CriterioRanking(
        key="recencia",
        rotulo="Recência (decay)",
        descricao=(
            "Quanto pesa a live ser recente. O decay é exponencial e cai pela metade "
            "a cada 'meia-vida' (abaixo)."
        ),
        eh_peso=True,
    ),
    CriterioRanking(
        key="vph",
        rotulo="Momento (views por hora)",
        descricao=(
            "Quanto pesa o ritmo de audiência da live (views por hora, em escala log). "
            "Um piso de idade evita premiar a live recém-publicada; capta o 'momento' "
            "sem confundir com recência."
        ),
        eh_peso=True,
    ),
    CriterioRanking(
        key="views",
        rotulo="Audiência bruta (views)",
        descricao=(
            "Quanto pesa o total de visualizações da live (em escala log, para não "
            "deixar um viral dominar). Peso relativo aos demais critérios."
        ),
        eh_peso=True,
    ),
    CriterioRanking(
        key=_CHAVE_MEIA_VIDA,
        rotulo="Meia-vida da recência (dias)",
        descricao=(
            "Em quantos dias o peso de recência cai pela metade. Menor = favorece "
            "lives novas com mais agressividade. NÃO é um peso; deve ser maior que 0."
        ),
        eh_peso=False,
    ),
)

_CRITERIOS_POR_KEY: dict[str, CriterioRanking] = {c.key: c for c in _CRITERIOS}


def catalogo() -> tuple[CriterioRanking, ...]:
    """Os critérios do ranking, na ordem de exibição."""
    return _CRITERIOS


# --------------------------------------------------------------------------- #
# Default versionado (alvo do reset e fonte do seed): os `ranking_*` de settings
# --------------------------------------------------------------------------- #


def _defaults() -> dict[str, float]:
    """Valores default de cada critério, lidos de `config.settings` (o antigo `.env`)."""
    return {
        "views": float(settings.ranking_peso_views),
        "likes_por_view": float(settings.ranking_peso_likes_por_view),
        "comentarios_por_view": float(settings.ranking_peso_comentarios_por_view),
        "sentimento": float(settings.ranking_peso_sentimento),
        "recencia": float(settings.ranking_peso_recencia),
        "vph": float(settings.ranking_peso_vph),
        "meia_vida_dias": float(settings.ranking_meia_vida_dias),
    }


# --------------------------------------------------------------------------- #
# Guardrail (validação antes de gravar)
# --------------------------------------------------------------------------- #


def validar_pesos(valores: dict) -> None:
    """Valida os pesos/critérios; levanta `ValueError` se inválido.

    Regras:
      - todas as chaves presentes;
      - todos os valores >= 0 (peso negativo não faz sentido);
      - ao menos UM peso > 0 (senão o reescalonamento 0-100 zeraria — divisão por 0);
      - `meia_vida_dias` > 0 (o decay exponencial exige meia-vida positiva).
    """
    faltando = [k for k in _TODAS_CHAVES if k not in valores]
    if faltando:
        raise ValueError("Faltam critérios: " + ", ".join(sorted(faltando)) + ".")

    for chave in _TODAS_CHAVES:
        try:
            valor = float(valores[chave])
        except (TypeError, ValueError) as e:
            raise ValueError(f"O valor de '{chave}' deve ser numérico.") from e
        if valor < 0:
            raise ValueError(f"O valor de '{chave}' não pode ser negativo.")

    if all(float(valores[chave]) == 0 for chave in _CHAVES_PESO):
        raise ValueError("Ao menos um peso deve ser maior que 0 (senão o ranking zera).")

    if float(valores[_CHAVE_MEIA_VIDA]) <= 0:
        raise ValueError("A meia-vida da recência (dias) deve ser maior que 0.")


# --------------------------------------------------------------------------- #
# Resolução por canal (banco → seed a partir do default de settings)
# --------------------------------------------------------------------------- #


def _resolver_db_e_canal(db_path: Path | None, channel_id: str | None) -> tuple[Path, str]:
    db = db_path if db_path is not None else channel_paths.settings_db_path()
    cid = channel_id if channel_id is not None else channel_paths.active_channel_root().name
    return db, cid


def resolver_pesos(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> PesosRanking:
    """Resolve os pesos do ranking do canal ATIVO — banco como fonte da verdade.

    Ordem (espelha `prompts_utilitarios.resolver_prompt`):
      1. BANCO (tabela `ranking_pesos`): se há linha, é a fonte da verdade.
      2. Sem linha → SEMEIA a partir dos defaults de `config.settings` e devolve. A
         partir daí o banco basta (idempotente).

    Devolve o dataclass PURO `PesosRanking` (o serviço injeta no domain). Nunca lança
    no caminho feliz. Os kwargs isolam testes do `instance/` real.
    """
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    atual = settings_store.ler_ranking_pesos(db, cid)
    if atual is None:
        atual = _defaults()
        settings_store.gravar_ranking_pesos(db, cid, atual)
    return PesosRanking(**{k: float(atual[k]) for k in _TODAS_CHAVES})


# --------------------------------------------------------------------------- #
# Fachada de gestão (UI de Canais): valores atuais + rótulos + default, editar, resetar
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class CriterioDescrito:
    """Critério para a UI: rótulo/descrição + valor-do-canal + default (alvo do reset)."""

    key: str
    rotulo: str
    descricao: str
    eh_peso: bool
    valor: float
    valor_default: float


def descrever_pesos(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> list[CriterioDescrito]:
    """Os critérios do canal ativo com rótulo/descrição + valor-do-canal + default.

    Alimenta a UI de Canais: mostra QUAIS critérios existem (rótulo + descrição), o
    valor atual do canal (editável) e o default (para resetar).
    """
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    pesos = resolver_pesos(db_path=db, channel_id=cid)
    defaults = _defaults()
    return [
        CriterioDescrito(
            key=cat.key,
            rotulo=cat.rotulo,
            descricao=cat.descricao,
            eh_peso=cat.eh_peso,
            valor=float(getattr(pesos, cat.key)),
            valor_default=float(defaults[cat.key]),
        )
        for cat in _CRITERIOS
    ]


def definir_pesos(
    valores: dict,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> list[CriterioDescrito]:
    """Edita os pesos do canal ativo pela UI, VALIDANDO antes de gravar.

    Levanta `ValueError` (→ 422 no router) se algum critério for inválido. Grava no
    banco (fonte da verdade) e devolve os critérios descritos (valores + rótulos).
    """
    validar_pesos(valores)
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    settings_store.gravar_ranking_pesos(db, cid, {k: float(valores[k]) for k in _TODAS_CHAVES})
    return descrever_pesos(db_path=db, channel_id=cid)


def resetar_pesos(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> list[CriterioDescrito]:
    """Restaura os pesos aos DEFAULTS de `config.settings` (reset-para-o-padrão)."""
    return definir_pesos(_defaults(), db_path=db_path, channel_id=channel_id)
