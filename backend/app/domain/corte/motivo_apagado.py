"""D-993: por que o operador apagou um corte que a IA propôs.

Na D-989, 31% das propostas do cortador-expert (177 de 570) tinham sido
apagadas, e ninguém sabia de qual live nem por quê: o snapshot da proposta
(D-303) ficava órfão. Agora ele guarda o projeto e a hora do apagar, e aceita
um motivo — opcional, para o gesto de apagar continuar rápido.

O motivo é vocabulário fechado porque texto livre não agrega. Cada slug aponta para uma decisão distinta da
análise, para o levantamento saber QUAL parte da skill corrigir.

D-1005: um corte pode sair por mais de um motivo. A lista se guarda como os
slugs separados por `|`, na ordem do vocabulário. Um registro anterior, com um
motivo só ("repetido"), já é uma lista de um item: lê-se sem migration.

D-1006: o vocabulário é de cada canal, no `settings.db`, editável na tela de
Canais (`domain/corte/motivos_do_canal.py`). `MOTIVOS_APAGADO` passou a ser o
padrão de todo canal nunca editado, e as funções abaixo recebem os slugs do
canal (o padrão, se ninguém os passar).

Sem I/O — vocabulário e contagem puros; o service é quem fala com o banco.
"""

from __future__ import annotations

from collections.abc import Iterable

# O padrão de todo canal (D-1006). Ordem = ordem de exibição na tela.
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

SEPARADOR = "|"


def motivos_apagado(bruto: str | None, slugs: Iterable[str] = SLUGS_MOTIVOS_APAGADO) -> list[str]:
    """Os motivos de `slugs` num registro, sem repetição, na ordem do vocabulário.

    Slug desconhecido sai em silêncio: o motivo é apoio ao apagar, e recusar o
    apagar porque a tela mandou um slug velho custaria mais do que perder a
    explicação.
    """
    informados = {slug.strip() for slug in (bruto or "").split(SEPARADOR)}
    return [slug for slug in slugs if slug in informados]


def normalizar_motivo_apagado(
    motivo: str | None, slugs: Iterable[str] = SLUGS_MOTIVOS_APAGADO
) -> str:
    """Os motivos prontos para gravar ("tema_fraco|repetido"); "" = sem motivo.

    D-1006: `slugs` são os motivos que o canal oferece hoje — os visíveis.
    """
    return SEPARADOR.join(motivos_apagado(motivo, slugs))


def contar_apagados_por_motivo(
    motivos: Iterable[str | None], slugs: Iterable[str] = SLUGS_MOTIVOS_APAGADO
) -> dict:
    """Quantos apagados há, e quantas vezes cada motivo foi marcado.

    `total` conta apagados; `por_motivo` conta marcações, então um apagado com
    dois motivos soma um em cada. Todo slug do vocabulário aparece, mesmo com
    zero, para a tela e o levantamento compararem projetos sem adivinhar chave
    ausente.

    D-1006: `slugs` são TODOS os motivos do canal, inclusive os escondidos — o
    apagado de ontem continua contado depois que o motivo saiu dos chips.
    """
    slugs = tuple(slugs)
    por_motivo = dict.fromkeys((*slugs, SEM_MOTIVO), 0)
    total = 0
    for bruto in motivos:
        for slug in motivos_apagado(bruto, slugs) or [SEM_MOTIVO]:
            por_motivo[slug] += 1
        total += 1
    return {"total": total, "por_motivo": por_motivo}
