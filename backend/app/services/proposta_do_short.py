"""D-995: o short que a IA propõe nasce com a proposta congelada ao lado.

`registrar_sugestoes` (`services/shorts.py`) cria os candidatos por aqui: cada
`Short` sai junto do seu `ShortSnapshot`, na mesma transação. O snapshot nunca é
reescrito — editar as bordas, regerar ou juntar cortes mexe só no short.
"""

import uuid
from dataclasses import dataclass

from app.domain.compartilhado.provider_ia import ProviderIA
from app.domain.short.shorts import SugestaoShort
from app.models import Short, ShortSnapshot, StatusShort
from app.services.canal import editorial_skills
from app.services.claude_ia import modelo_usado


@dataclass(frozen=True)
class OrigemDaProposta:
    """Quem propôs: o provider da chamada e o modelo que a atendeu."""

    provedor: str = ""
    modelo: str = ""


# Quem chama `registrar_sugestoes` sem dizer a IA (os testes do serviço): a
# proposta congela igual, só sem o selo de quem a fez.
SEM_ORIGEM = OrigemDaProposta()


def origem_da(skill: editorial_skills.SkillResolvida, provider: ProviderIA) -> OrigemDaProposta:
    return OrigemDaProposta(provider, modelo_usado(skill, provider))


def para_modelo(corte_id: str, numero: int, sugestao: SugestaoShort) -> Short:
    return Short(
        id=str(uuid.uuid4()),
        corte_id=corte_id,
        numero=numero,
        titulo_sugerido=sugestao.titulo,
        gancho=sugestao.gancho,
        inicio_seg=sugestao.inicio_seg,
        fim_seg=sugestao.fim_seg,
        score=sugestao.score,
        justificativa=sugestao.justificativa,
        status=StatusShort.SUGERIDO,
    )


def congelar(shorts: list[Short], projeto_id: str, origem: OrigemDaProposta) -> list[ShortSnapshot]:
    """Uma cópia imutável de cada short recém-proposto, ainda sem edição humana."""
    return [
        ShortSnapshot(
            id=str(uuid.uuid4()),
            short_id=short.id,
            corte_id=short.corte_id,
            projeto_id=projeto_id,
            numero=short.numero,
            titulo_sugerido=short.titulo_sugerido,
            gancho=short.gancho,
            inicio_seg=short.inicio_seg,
            fim_seg=short.fim_seg,
            score=short.score,
            provedor=origem.provedor,
            modelo=origem.modelo,
        )
        for short in shorts
    ]
