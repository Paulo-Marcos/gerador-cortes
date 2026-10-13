"""O que um lote É: as opções, os itens e o lote inteiro (D-564, D-908).

Saiu do `publicacao_lote` quando ele chegou ao teto de tamanho (D-771): lá
fica o que o lote FAZ — raias, estados, vigília —, aqui o que ele carrega.
Sem I/O: são os dados que a raia lê e a tela recebe.
"""

from __future__ import annotations

import threading
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.escalonamento import destino_de
from app.domain.publicacao.publicacao import LIMITES, Plataforma
from app.domain.publicacao.ritmo_publicacao import (
    ESTADOS_FORA_DA_RAIA,
    Cadencia,
    EstadoItem,
    cadencia_de,
)


@dataclass(frozen=True)
class OpcoesDoLote:
    """As escolhas que mudam COMO cada plataforma é publicada (D-564).

    `tiktok_assistido` e `instagram_assistido` decidem o TRANSPORTE: com eles o
    robô abre o Chrome e sobe; sem eles, o lote só monta a pasta. Continuam
    sendo escolhas porque o assistido depende de seletores de páginas que não
    são nossas — no dia em que uma delas se redesenhar, desligar aquela devolve
    o caminho que funciona, sem derrubar a outra.

    São dois interruptores e não um justamente por isso: as duas páginas quebram
    em dias diferentes.

    `publicar_sozinho` decide QUEM aperta o botão, e vale para as duas. Desligado
    por padrão, e essa assimetria é intencional: até o clique tudo é reversível.
    """

    tiktok_assistido: bool = False
    instagram_assistido: bool = False
    publicar_sozinho: bool = False
    # D-580: quando o operador marca dia e hora, ela vale para o LOTE inteiro —
    # cada destino a honra do jeito que consegue (a API do YouTube com
    # `publishAt`, o robo do TikTok clicando no Studio) e os que nao conseguem
    # dizem isso em vez de engolir a data.
    agendamento: Agendamento | None = None
    # D-590: sobe de novo o que já foi publicado. Existe porque "já subiu" não
    # quer dizer "subiu certo" — um short com a capa errada no ar precisa voltar
    # para a fila. Desligado por padrão: republicar em silêncio duplicaria vídeo.
    republicar: bool = False


class LoteEmAndamento(RuntimeError):
    """Já existe um lote rodando — e um operador só não publica dois ao mesmo tempo."""


@dataclass
class ItemDoLote:
    """Um vídeo indo para UMA plataforma. A unidade de trabalho da raia."""

    alvo_tipo: str
    alvo_id: str
    plataforma: Plataforma
    rotulo: str
    """O título do short, para a tela não mostrar um uuid."""
    registro_id: str
    estado: EstadoItem = EstadoItem.AGUARDANDO
    detalhe: str = ""
    url: str = ""
    # D-591: o sinal que tira a raia da vigília do robô. Sem ele, "cancelar" e
    # "publiquei" mudavam o estado, mas a raia seguia presa esperando a aba — e
    # os itens seguintes ficavam parados por até meia hora.
    #
    # `threading` e não `asyncio`: quem lê o sinal é a vigília, que roda num
    # thread (Playwright síncrono, D-369).
    espera: threading.Event = field(default_factory=threading.Event, repr=False, compare=False)
    # D-908: a data DESTE item, quando o lote foi distribuído pela janela do
    # canal. `None` cai na data única do lote (`OpcoesDoLote.agendamento`), ou
    # em "agora" quando nem ela existe.
    agendamento: Agendamento | None = None

    def agendamento_efetivo(self, do_lote: Agendamento | None) -> Agendamento | None:
        """A data que vale para este item: a dele, ou a do lote inteiro."""
        return self.agendamento or do_lote

    def agendado_para_utc(self) -> datetime | None:
        """O instante em UTC sem fuso, como o banco guarda as outras datas."""
        if self.agendamento is None:
            return None
        return self.agendamento.quando.astimezone(UTC).replace(tzinfo=None)

    def como_dict(self) -> dict:
        return {
            "alvo_tipo": self.alvo_tipo,
            "alvo_id": self.alvo_id,
            "plataforma": self.plataforma.value,
            "plataforma_rotulo": LIMITES[self.plataforma].rotulo,
            "rotulo": self.rotulo,
            "estado": self.estado.value,
            "detalhe": self.detalhe,
            "url": self.url,
            "agendado_para": self.agendamento.legivel() if self.agendamento else "",
        }


@dataclass
class Lote:
    """O lote inteiro: os itens, as raias e o que já parou."""

    id: str
    criado_em: datetime
    itens: list[ItemDoLote] = field(default_factory=list)
    opcoes: OpcoesDoLote = field(default_factory=OpcoesDoLote)
    cancelado: bool = False
    avisos: dict[str, str] = field(default_factory=dict)
    """Por plataforma: por que a raia parou antes do fim (cota, sessão, layout)."""

    def da_plataforma(self, plataforma: Plataforma) -> list[ItemDoLote]:
        return [i for i in self.itens if i.plataforma is plataforma]

    @property
    def plataformas(self) -> list[Plataforma]:
        """Na ordem canônica, e sem repetir."""
        return [p for p in Plataforma if any(i.plataforma is p for i in self.itens)]

    @property
    def terminou(self) -> bool:
        return all(i.estado in ESTADOS_FORA_DA_RAIA for i in self.itens)

    def como_dict(self) -> dict:
        return {
            "lote_id": self.id,
            "criado_em": self.criado_em.isoformat(),
            "cancelado": self.cancelado,
            "terminou": self.terminou,
            "tiktok_assistido": self.opcoes.tiktok_assistido,
            "instagram_assistido": self.opcoes.instagram_assistido,
            "publicar_sozinho": self.opcoes.publicar_sozinho,
            "raias": [
                {
                    "plataforma": p.value,
                    "rotulo": LIMITES[p].rotulo,
                    "exige_humano": cadencia_de(p).exige_humano,
                    "aviso": self.avisos.get(p.value, ""),
                    "itens": [i.como_dict() for i in self.da_plataforma(p)],
                }
                for p in self.plataformas
            ],
        }


# D-908: a data de cada (alvo, plataforma) quando o lote foi distribuído pela
# janela do canal. `None` é o lote de sempre: uma data só, ou nenhuma.
AgendaDoLote = dict[tuple[str, str], Agendamento | None]
SEM_DATA_NA_AGENDA = "sem data na agenda: ajuste a linha ou publique em outro lote"


def agendamento_do_item(
    agenda: AgendaDoLote | None, alvo_id: str, plataforma: Plataforma
) -> Agendamento | None:
    if agenda is None:
        return None
    return agenda.get((alvo_id, plataforma.value))


def escalona(plataforma: Plataforma) -> bool:
    """Se a plataforma entra no escalonamento (o Instagram publica no ato)."""
    return destino_de(plataforma.value) is not None


def recado_do_pacote(resultado: dict, ritmo: Cadencia) -> str:
    """O que o operador faz agora, com o pacote já montado."""
    pasta = str(resultado.get("pasta", ""))
    recado = f"pacote pronto em {pasta}" if pasta else f"pacote do {ritmo.rotulo} pronto"
    return com_avisos(recado, resultado.get("avisos") or [])


def com_avisos(recado: str, avisos: Sequence[str]) -> str:
    """O recado do item, seguido dos avisos quando há — ou só os avisos."""
    juntos = "; ".join(str(a) for a in avisos)
    if not juntos:
        return recado
    return f"{recado} — {juntos}" if recado else juntos
