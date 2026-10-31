"""Base declarativa e enums de status dos modelos."""

import enum

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class StatusProjeto(str, enum.Enum):
    PENDENTE = "pendente"
    BAIXANDO = "baixando"
    TRANSCREVENDO = "transcrevendo"
    PRONTO = "pronto"
    ANALISANDO = "analisando"
    ANALISADO = "analisado"
    ERRO = "erro"


class StatusCorte(str, enum.Enum):
    PROPOSTO = "proposto"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"
    # D-665: EDITADO saiu — existia no enum, mas nada o atribuía (0 cortes na PROD).
    PROCESSADO = "processado"


class StatusShort(str, enum.Enum):
    """Estagio de um short dentro da fabrica (E-030).

    SUGERIDO    -> a IA propos o trecho; aguarda curadoria humana.
    APROVADO    -> o operador aceitou o candidato; entra na fila de producao.
    REJEITADO   -> descartado na curadoria; fica no historico, nao some.
    RENDERIZADO -> MP4 vertical pronto em `arquivo_short_path`.
    """

    SUGERIDO = "sugerido"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"
    RENDERIZADO = "renderizado"


class StatusLiveCandidata(str, enum.Enum):
    """Estado de uma live na fila de ranking (F-052).

    PENDENTE  → ainda elegível para aparecer no TOP 20.
    REJEITADA → o operador descartou; some do ranking, libera vaga p/ a próxima.
    PROMOVIDA → virou Projeto via botão "Baixar"; FK guarda o vínculo.
    """

    PENDENTE = "pendente"
    REJEITADA = "rejeitada"
    PROMOVIDA = "promovida"
