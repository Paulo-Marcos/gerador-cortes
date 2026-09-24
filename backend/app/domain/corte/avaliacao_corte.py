"""D-419: avaliação humana da qualidade de um corte, colhida na 1ª geração do bruto.

O voto da live (`Projeto.voto_qualidade_live`, D-372) chega tarde demais para
dizer algo sobre a GERAÇÃO dos cortes: quando a live inteira termina, metade
deles já saiu da memória do editor. Aqui a nota é por corte, dada no momento em
que ele acabou de mexer nas bordas e mandou gerar o bruto.

A nota sozinha diz *que* um corte saiu ruim, não *onde* a proposta errou — por
isso o motivo é um vocabulário fechado, e não texto livre: só assim o
levantamento posterior consegue agregar ("40% dos cortes nota ≤2 é borda de
início"). O comentário livre fica como complemento, nunca como o dado principal.

Sem I/O — vocabulário e validação puros; o service é quem fala com o banco.
"""

from __future__ import annotations

import json
from collections.abc import Iterable

VOTO_MINIMO = 1
VOTO_MAXIMO = 5

# Corta comentário absurdo (colagem acidental de transcrição) sem incomodar
# quem escreve um parágrafo de verdade.
LIMITE_COMENTARIO = 2000

# Vocabulário fechado de ressalvas. Cada slug aponta para uma decisão distinta
# da geração — borda, duração, seleção do tema, texto proposto — para que o
# levantamento saiba QUAL etapa melhorar. Ordem = ordem de exibição na UI.
MOTIVOS_AVALIACAO: tuple[dict[str, str], ...] = (
    {"slug": "borda_inicio", "rotulo": "Começo fora do lugar"},
    {"slug": "borda_fim", "rotulo": "Fim fora do lugar"},
    {"slug": "duracao", "rotulo": "Duração errada"},
    {"slug": "contexto", "rotulo": "Falta contexto"},
    {"slug": "tema_fraco", "rotulo": "Tema não rende"},
    {"slug": "gancho_fraco", "rotulo": "Gancho fraco"},
    {"slug": "titulo", "rotulo": "Título proposto ruim"},
    {"slug": "trechos", "rotulo": "Trechos sugeridos ruins"},
)

SLUGS_MOTIVOS: tuple[str, ...] = tuple(motivo["slug"] for motivo in MOTIVOS_AVALIACAO)


def validar_voto(voto: int) -> int:
    """Nota 1-5. Faixa é regra do domínio, não validação de HTTP."""
    if not isinstance(voto, int) or isinstance(voto, bool):
        raise ValueError("Voto deve ser um inteiro entre 1 e 5")
    if voto < VOTO_MINIMO or voto > VOTO_MAXIMO:
        raise ValueError(f"Voto deve estar entre {VOTO_MINIMO} e {VOTO_MAXIMO}")
    return voto


def normalizar_motivos(motivos: Iterable[str] | None) -> list[str]:
    """Motivos conhecidos, sem repetição, na ordem canônica do vocabulário.

    Slug desconhecido é descartado em silêncio: motivo é dado de apoio à nota —
    derrubar a avaliação inteira porque a UI mandou um slug velho custaria mais
    do que perder a ressalva.
    """
    informados = {str(slug).strip() for slug in (motivos or [])}
    return [slug for slug in SLUGS_MOTIVOS if slug in informados]


def motivos_persistidos(bruto: str | None) -> list[str]:
    """Motivos guardados na coluna JSON, tolerante a legado/corrompido."""
    try:
        dados = json.loads(bruto or "[]")
    except (ValueError, TypeError):
        return []
    return normalizar_motivos(dados if isinstance(dados, list) else [])


def serializar_motivos(motivos: Iterable[str] | None) -> str:
    """Motivos normalizados prontos para a coluna JSON."""
    return json.dumps(normalizar_motivos(motivos), ensure_ascii=False)


def normalizar_comentario(comentario: str | None) -> str:
    return (comentario or "").strip()[:LIMITE_COMENTARIO]


def rotulo_do_motivo(slug: str) -> str:
    """Rótulo legível do slug; o próprio slug quando ele não é do vocabulário."""
    for motivo in MOTIVOS_AVALIACAO:
        if motivo["slug"] == slug:
            return motivo["rotulo"]
    return slug
