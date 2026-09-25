"""Quando o post vai ao ar — a regra, longe de qualquer plataforma (D-580).

## Por que um modulo proprio para "uma data"

Porque nao e uma data: e uma data que quatro plataformas aceitam de jeitos
diferentes e recusam por motivos diferentes. O YouTube quer ISO em UTC com `Z`.
O TikTok quer um dia clicado num calendario e um minuto que seja multiplo de
cinco. O Instagram tem horizonte proprio. Se cada destino parsear a string do
operador do seu jeito, o mesmo "12/09 as 14:03" vira quatro comportamentos —
tres deles errados, e todos descobertos em producao.

Aqui mora a unica coisa que todos concordam: o instante. Cada destino pergunta
a este objeto o formato de que precisa, e recusa cedo o que nao consegue honrar.

## O fuso, que e onde isto costuma quebrar

O operador escolhe na tela dele, no relogio dele. O TikTok Studio tambem mostra
o relogio do navegador — entao ali o horario LOCAL passa direto. Ja o YouTube
quer UTC. Por isso o instante nasce ciente do fuso da maquina: converter na
saida e seguro, adivinhar na entrada nao e.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

# O TikTok so oferece minutos de cinco em cinco no seletor, e nao ha campo para
# digitar: pedir 14:03 seria pedir um clique que nao existe.
PASSO_DO_MINUTO_TIKTOK = 5

# Ate onde cada plataforma deixa agendar, em dias. Medido no TikTok Studio em
# 11/09/2026: dias fora da janela vem SEM a classe `valid` no calendario.
HORIZONTE_EM_DIAS = {
    "tiktok": 10,
    "instagram_reels": 75,
    "youtube_shorts": 365,
    "youtube": 365,
}

# Margem minima entre agora e o instante pedido. Sem ela, um agendamento para
# "daqui a um minuto" perderia a corrida contra o proprio upload.
MARGEM_MINIMA = timedelta(minutes=5)


class AgendamentoInvalido(ValueError):
    """A data pedida nao serve, e a mensagem diz por que em uma frase."""


@dataclass(frozen=True)
class Agendamento:
    """O instante em que o post deve ir ao ar, ciente do fuso.

    >>> a = Agendamento.de_texto("2030-09-12T14:05")
    >>> a.data_iso(), a.hora(), a.minuto()
    ('2030-09-12', '14', '05')
    >>> Agendamento.de_texto("") is None
    True
    """

    quando: datetime

    @classmethod
    def de_texto(cls, texto: str | None) -> Agendamento | None:
        """Le o que a tela manda (`AAAA-MM-DDTHH:MM`), ou nada.

        Vazio devolve `None` e nao excecao: "sem agendamento" e uma resposta
        legitima — e a de hoje —, nao um erro do operador.

        >>> Agendamento.de_texto(None) is None
        True
        >>> Agendamento.de_texto("2030-01-02T08:30").quando.hour
        8
        >>> try:
        ...     Agendamento.de_texto("amanha de tarde")
        ... except AgendamentoInvalido as erro:
        ...     print(erro)
        nao entendi a data 'amanha de tarde'; esperava algo como 2026-09-12T14:05
        """
        if not texto or not texto.strip():
            return None
        try:
            instante = datetime.fromisoformat(texto.strip())
        except ValueError as exc:
            raise AgendamentoInvalido(
                f"nao entendi a data {texto!r}; esperava algo como 2026-09-12T14:05"
            ) from exc
        if instante.tzinfo is None:
            instante = instante.astimezone()
        return cls(instante)

    def data_iso(self) -> str:
        """`AAAA-MM-DD` — o que o campo de data do TikTok mostra."""
        return self.quando.strftime("%Y-%m-%d")

    def dia(self) -> str:
        """O numero do dia SEM zero a esquerda: e assim que o calendario escreve.

        >>> Agendamento.de_texto("2030-09-05T10:00").dia()
        '5'
        """
        return str(self.quando.day)

    def hora(self) -> str:
        """>>> Agendamento.de_texto("2030-09-05T09:00").hora()
        '09'
        """
        return self.quando.strftime("%H")

    def minuto(self) -> str:
        """>>> Agendamento.de_texto("2030-09-05T09:05").minuto()
        '05'
        """
        return self.quando.strftime("%M")

    def em_utc_iso(self) -> str:
        """`publishAt` do YouTube: ISO 8601 em UTC, com `Z`.

        >>> from datetime import timezone, timedelta
        >>> tres_horas_a_menos = timezone(timedelta(hours=-3))
        >>> Agendamento(datetime(2030, 9, 12, 14, 5, tzinfo=tres_horas_a_menos)).em_utc_iso()
        '2030-09-12T17:05:00Z'
        """
        return self.quando.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    def legivel(self) -> str:
        """Como a falha e o log contam a data para o operador.

        >>> Agendamento.de_texto("2030-09-12T14:05").legivel()
        '12/09/2030 as 14:05'
        """
        return self.quando.strftime("%d/%m/%Y as %H:%M")


def validar(agendamento: Agendamento, plataforma: str, *, agora: datetime | None = None) -> None:
    """Recusa cedo o que a plataforma recusaria tarde — ou nao recusaria nunca.

    O caso que justifica a funcao e o terceiro: um minuto quebrado no TikTok NAO
    da erro, porque nao ha erro a dar — o seletor simplesmente nao tem a opcao
    14:03, e o robo sairia clicando em qualquer coisa parecida. Falhar aqui, com
    o nome do problema, e melhor que publicar as 14:00 sem ninguem saber.

    >>> from datetime import datetime, timedelta
    >>> agora = datetime(2030, 9, 12, 10, 0).astimezone()
    >>> validar(Agendamento.de_texto("2030-09-12T14:05"), "tiktok", agora=agora)
    >>> def porque(texto, plataforma="tiktok"):
    ...     try:
    ...         validar(Agendamento.de_texto(texto), plataforma, agora=agora)
    ...     except AgendamentoInvalido as erro:
    ...         print(erro)
    >>> porque("2030-09-12T14:03")
    o TikTok so agenda de 5 em 5 minutos, e 12/09/2030 as 14:03 cai fora da grade
    >>> porque("2030-09-12T09:00")
    12/09/2030 as 09:00 ja passou ou esta perto demais; escolha ao menos 5 minutos a frente
    >>> porque("2030-10-30T10:00")
    o tiktok so agenda ate 10 dias a frente; 30/10/2030 as 10:00 esta fora da janela
    """
    referencia = agora or datetime.now().astimezone()
    if referencia.tzinfo is None:
        referencia = referencia.astimezone()

    if agendamento.quando <= referencia + MARGEM_MINIMA:
        raise AgendamentoInvalido(
            f"{agendamento.legivel()} ja passou ou esta perto demais; "
            f"escolha ao menos {int(MARGEM_MINIMA.total_seconds() // 60)} minutos a frente"
        )

    horizonte = HORIZONTE_EM_DIAS.get(plataforma)
    if horizonte and agendamento.quando > referencia + timedelta(days=horizonte):
        raise AgendamentoInvalido(
            f"o {plataforma} so agenda ate {horizonte} dias a frente; "
            f"{agendamento.legivel()} esta fora da janela"
        )

    if plataforma.startswith("tiktok") and agendamento.quando.minute % PASSO_DO_MINUTO_TIKTOK:
        raise AgendamentoInvalido(
            f"o TikTok so agenda de {PASSO_DO_MINUTO_TIKTOK} em {PASSO_DO_MINUTO_TIKTOK} "
            f"minutos, e {agendamento.legivel()} cai fora da grade"
        )


def ja_esta_no_ar(agendado_para: str, agora: datetime) -> bool:
    """Se um vídeo já enviado ao YouTube pode ser visto agora (D-703).

    Sem agendamento, ele sobe não listado — quem tem o link assiste —, então conta
    como no ar. Com agendamento, a partir da hora marcada; sem fuso, a hora é UTC,
    como o YouTube a devolve. Agendamento ilegível conta como no ar: é melhor
    mostrar acessível do que esconder um vídeo que talvez já esteja público.
    """
    if not agendado_para:
        return True
    try:
        quando = datetime.fromisoformat(agendado_para.replace("Z", "+00:00"))
    except ValueError:
        return True
    if quando.tzinfo is None:
        quando = quando.replace(tzinfo=UTC)
    return agora >= quando
