"""O roteiro do agendamento de Reels no Meta Business Suite (D-1010).

## Por que outro roteiro, e não uma emenda no do instagram.com

Porque é outra tela, em outro domínio. O compositor do instagram.com não agenda
(medido em 12/09 e 13/10/2026), e o criador de Reels do Business Suite agenda,
com a conta de criador e sem Página do Facebook (medido em 02/11/2026). Com data,
o Reel vai por aqui; sem data, continua pelo instagram.com.

## A prova de que agendou

MEDIDA agendando de verdade em 02/11/2026: em cerca de 2 s, a aba sai do
`reels_composer` e vai para `posts/scheduled_posts`, e a lista mostra o Reel com
a data pedida. É um sinal positivo, como a confirmação do instagram.com: fechar
ou descartar o compositor nunca leva para essa página.

A linha da lista NÃO entra na prova (D-1012). Ela é legível, medida em 02/11/2026:
`tr[role=row]` com o título e "Mon Nov 9, 7:35pm". Mas falta medir quando ela nasce
depois do clique e se ela está no DOM quando a lista tem muitos itens; sem isso, a
conferência acusaria falha em Reel agendado. E, na vigília, o operador pode ter
acertado a data na aba: a lista nem teria com o que comparar.
"""

from __future__ import annotations

from enum import StrEnum

from app.domain.publicacao.agendamento import Agendamento

MEIO_DIA = 12
ESPACO_INVISIVEL = "\u200b"


class Passo(StrEnum):
    """Os passos do roteiro, na ordem em que acontecem."""

    ABRIR = "abrir"
    SESSAO = "sessao"
    CONTA = "conta"
    ARQUIVO = "arquivo"
    LEGENDA = "legenda"
    CAPA = "capa"
    AVANCAR = "avancar"
    AGENDAMENTO = "agendamento"
    REVISAO = "revisao"
    PUBLICAR = "publicar"


ROTULOS: dict[Passo, str] = {
    Passo.ABRIR: "abrindo o Business Suite",
    Passo.SESSAO: "conferindo a sessão",
    Passo.CONTA: "conferindo a conta do Reel",
    Passo.ARQUIVO: "enviando o vídeo",
    Passo.LEGENDA: "escrevendo a legenda",
    Passo.CAPA: "trocando a capa",
    Passo.AVANCAR: "passando pelas etapas de edição",
    Passo.AGENDAMENTO: "marcando dia e hora",
    Passo.REVISAO: "deixando pronto para você conferir",
    Passo.PUBLICAR: "agendando",
}


ORIENTACOES: dict[Passo, str] = {
    Passo.ABRIR: (
        "Nao consegui abrir o Business Suite. Confira se o navegador do robo abriu e se ha "
        "internet."
    ),
    Passo.SESSAO: (
        "Este navegador nao entrou no Business Suite. Na janela que abriu, clique em Continuar "
        "com o Instagram — uma vez so, a sessao fica guardada — e rode de novo."
    ),
    Passo.ARQUIVO: (
        "O criador de Reels nao aceitou o video. A tela pode ter mudado: agende este Reel a "
        "mao no Business Suite e me avise para eu ajustar."
    ),
    Passo.LEGENDA: "Nao achei a caixa da legenda. Escreva a legenda na aba que ficou aberta.",
    Passo.AVANCAR: (
        "Travei numa das etapas do criador de Reels. A aba ficou aberta: siga a mao a partir dali."
    ),
    Passo.AGENDAMENTO: (
        "Nao consegui marcar a data. Nada foi agendado: confira dia e hora na aba que ficou aberta."
    ),
    Passo.REVISAO: (
        "O botao de agendar nao acendeu. Pode ser processamento em curso ou um aviso da Meta: "
        "confira na aba que ficou aberta."
    ),
    Passo.PUBLICAR: (
        "Cliquei em agendar e nao vi a lista de agendados. Confira na aba que ficou aberta e "
        "no Planner antes de agendar de novo."
    ),
}


class RoteiroInterrompido(RuntimeError):
    """Um passo falhou, e a mensagem já diz o que fazer."""

    def __init__(self, passo: Passo, detalhe: str = "") -> None:
        self.passo = passo
        self.detalhe = detalhe
        super().__init__(orientacao_da_falha(passo, detalhe))


def orientacao_da_falha(passo: Passo, detalhe: str = "") -> str:
    """O que o operador faz agora, em uma frase.

    >>> orientacao_da_falha(Passo.SESSAO).startswith("Este navegador nao entrou")
    True
    >>> orientacao_da_falha(Passo.LEGENDA, "timeout").endswith("(timeout)")
    True
    """
    base = ORIENTACOES.get(passo, f"Falhou {ROTULOS.get(passo, passo.value)}.")
    return f"{base} ({detalhe})" if detalhe else base


def descricao_do_progresso(feitos: list[Passo]) -> str:
    """O que o robô conseguiu fazer, para a tela contar sem inventar.

    >>> descricao_do_progresso([])
    'nada foi feito'
    >>> descricao_do_progresso([Passo.ARQUIVO, Passo.AGENDAMENTO])
    'enviando o vídeo e marcando dia e hora'
    """
    rotulos = [ROTULOS[p] for p in feitos]
    if not rotulos:
        return "nada foi feito"
    if len(rotulos) == 1:
        return rotulos[0]
    return f"{', '.join(rotulos[:-1])} e {rotulos[-1]}"


def pede_login(url: str) -> bool:
    """A Meta mandou para a porta de entrada das ferramentas comerciais?

    >>> pede_login("https://business.facebook.com/business/loginpage/?next=x")
    True
    >>> pede_login("https://business.facebook.com/latest/reels_composer")
    False
    """
    return "/loginpage" in url


def no_compositor(url: str) -> bool:
    """A aba ainda está no criador de Reels?

    >>> no_compositor("https://business.facebook.com/latest/reels_composer?asset_id=1")
    True
    >>> no_compositor("https://business.facebook.com/latest/content_calendar")
    False
    """
    return "/latest/reels_composer" in url


def agendou(url: str) -> bool:
    """A aba chegou à lista de agendados? Ver o cabeçalho do módulo.

    >>> agendou("https://business.facebook.com/latest/posts/scheduled_posts?asset_id=1")
    True
    >>> agendou("https://business.facebook.com/latest/reels_composer?asset_id=1")
    False
    """
    return "/latest/posts/scheduled_posts" in url


def nome_da_conta(mostrado: str) -> str:
    """O nome no seletor "Share to", sem os caracteres invisíveis que a Meta põe em volta.

    >>> nome_da_conta(ESPACO_INVISIVEL + "ateu.informa.cortes" + ESPACO_INVISIVEL)
    'ateu.informa.cortes'
    >>> nome_da_conta("")
    ''
    """
    return mostrado.replace(ESPACO_INVISIVEL, "").strip()


def data_para_digitar(agendamento: Agendamento) -> str:
    """O formato do campo: `mm/dd/yyyy`, o que o placeholder dele pede.

    >>> data_para_digitar(Agendamento.de_texto("2026-11-09T19:35"))
    '11/09/2026'
    """
    return agendamento.quando.strftime("%m/%d/%Y")


def hora_em_12h(agendamento: Agendamento) -> tuple[str, str, str]:
    """Hora, minuto e AM/PM: o seletor da Meta nesta conta tem relógio de 12 horas.

    >>> hora_em_12h(Agendamento.de_texto("2026-11-09T19:35"))
    ('07', '35', 'PM')
    >>> hora_em_12h(Agendamento.de_texto("2026-11-09T00:05"))
    ('12', '05', 'AM')
    >>> hora_em_12h(Agendamento.de_texto("2026-11-09T12:00"))
    ('12', '00', 'PM')
    """
    quando = agendamento.quando
    return quando.strftime("%I"), quando.strftime("%M"), "PM" if quando.hour >= MEIO_DIA else "AM"


def hora_marcada(agendamento: Agendamento, horas: str, minutos: str, periodo: str) -> bool:
    """Os campos ficaram com a hora pedida? Lê o que os `spinbutton` da Meta anunciam.

    >>> a = Agendamento.de_texto("2026-11-09T19:35")
    >>> hora_marcada(a, "7", "35", "PM"), hora_marcada(a, "7", "35", "AM")
    (True, False)
    >>> hora_marcada(a, "", "35", "PM")
    False
    """
    pedido_h, pedido_m, pedido_p = hora_em_12h(agendamento)
    if not (horas.isdigit() and minutos.isdigit()):
        return False
    return (int(horas), int(minutos), periodo) == (int(pedido_h), int(pedido_m), pedido_p)
