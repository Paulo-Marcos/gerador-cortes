"""D-993: por que o operador apagou um corte que a IA propôs.

Na D-989, 31% das propostas do cortador-expert (177 de 570) tinham sido
apagadas, e ninguém sabia de qual live nem por quê: o snapshot da proposta
(D-303) ficava órfão. Agora ele guarda o projeto e a hora do apagar, e aceita
um motivo — opcional, para o gesto de apagar continuar rápido.

O motivo é vocabulário fechado, como os de `avaliacao_corte.py`, e pelo mesmo
motivo: texto livre não agrega. Cada slug aponta para uma decisão distinta da
análise, para o levantamento saber QUAL parte da skill corrigir.

Sem I/O — vocabulário e contagem puros; o service é quem fala com o banco.
"""

from __future__ import annotations

from collections.abc import Iterable

# Ordem = ordem de exibição na tela.
MOTIVOS_APAGADO: tuple[dict[str, str], ...] = (
    {"slug": "tema_fraco", "rotulo": "Tema não rende"},
    {"slug": "repetido", "rotulo": "Repete outro corte"},
    {"slug": "sem_contexto", "rotulo": "Não se sustenta sozinho"},
    {"slug": "fora_da_linha", "rotulo": "Fora da linha do canal"},
    {"slug": "curto_demais", "rotulo": "Curto demais"},
    {"slug": "problema_tecnico", "rotulo": "Áudio ou vídeo com problema"},
)

SLUGS_MOTIVOS_APAGADO: tuple[str, ...] = tuple(motivo["slug"] for motivo in MOTIVOS_APAGADO)

# Chave da contagem para o apagado sem motivo. Não é um slug do vocabulário:
# é a ausência dele, e o levantamento precisa vê-la para saber quanto ainda
# está sem explicação.
SEM_MOTIVO = "sem_motivo"


def normalizar_motivo_apagado(motivo: str | None) -> str:
    """O slug conhecido, ou "" (sem motivo).

    Slug desconhecido vira "sem motivo" em silêncio: o motivo é apoio ao
    apagar, e recusar o apagar porque a tela mandou um slug velho custaria
    mais do que perder a explicação.
    """
    slug = (motivo or "").strip()
    return slug if slug in SLUGS_MOTIVOS_APAGADO else ""


def contar_apagados_por_motivo(motivos: Iterable[str | None]) -> dict:
    """Quantos apagados há por motivo, um item por apagado.

    Todo slug do vocabulário aparece, mesmo com zero, para a tela e o
    levantamento compararem projetos sem adivinhar chave ausente.
    """
    por_motivo = dict.fromkeys((*SLUGS_MOTIVOS_APAGADO, SEM_MOTIVO), 0)
    total = 0
    for motivo in motivos:
        por_motivo[normalizar_motivo_apagado(motivo) or SEM_MOTIVO] += 1
        total += 1
    return {"total": total, "por_motivo": por_motivo}
