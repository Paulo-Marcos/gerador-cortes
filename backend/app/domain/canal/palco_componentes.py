"""Os componentes do palco de um canal: estilo, cabeçalho e placa (D-911).

O palco é o que o FFmpeg empilha por cima do vídeo: fundo, molduras das janelas
e os textos fixos. Até a D-911 ele tinha um desenho só — o chrome chanfrado com
brackets verdes — e o único texto fixo era a placa do interlocutor, gravada por
corte no `layout_youtube`.

A nova composição ("Limpo · Grafite & Coral", aprovada no canvas de design de
13/10/2026) pede duas coisas que a placa por corte não dá:

  - um ESTILO de palco escolhido pelo canal, sem mexer na geometria dos slots;
  - componentes que o operador liga, desliga e renomeia — e, no cabeçalho,
    troca a imagem ao lado do @.

Este módulo é o contrato desses componentes: o que existe, o que cada campo
aceita e como uma edição parcial se funde com o que já estava gravado. Sem I/O.
Onde cada coisa é guardada (banco, pasta do canal) mora em
`services/palco_componentes.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from app.domain.compartilhado.erros import PedidoInvalido

ESTILO_ATUAL = "atual"
ESTILO_LIMPO = "limpo"
ESTILOS = (ESTILO_ATUAL, ESTILO_LIMPO)
ESTILO_PADRAO = ESTILO_ATUAL

# Os fundos do estilo limpo. Espelha `FUNDOS_DO_LIMPO` em
# `video-renderer/src/youtube-bg/palco-limpo.tsx`, que é quem os desenha; o
# padrão saiu das prévias sobre vídeo real de 13/10/2026.
FUNDOS = ("reticula-aurora", "reticula", "aurora", "linho", "chapado")
FUNDO_PADRAO = "reticula-aurora"

# D-913: o que o short mostra em volta das janelas. "palco" é o fundo do estilo
# (a textura do PNG); "eco" é o próprio vídeo, desfocado e escurecido, nas
# faixas que sobram — o quadro inteiro parece vir do vídeo, sem cor inventada.
# Só o estilo limpo tem eco: o chrome do atual é um PNG opaco por desenho.
FUNDO_SHORT_PALCO = "palco"
FUNDO_SHORT_ECO = "eco"
FUNDOS_DO_SHORT = (FUNDO_SHORT_PALCO, FUNDO_SHORT_ECO)

# D-913: como a legenda do short se separa do vídeo. "contorno" é o de sempre
# (quatro sombras duras de 2 px); "sombra" é a do limpo: só uma sombra suave e
# larga, sem a borda preta em volta de cada letra.
LEGENDA_CONTORNO = "contorno"
LEGENDA_SOMBRA = "sombra"
ESTILOS_DA_LEGENDA = (LEGENDA_CONTORNO, LEGENDA_SOMBRA)

# Tamanho máximo de nome e handle no cabeçalho: cabem numa linha do palco.
_TAMANHO_MAXIMO_DO_TEXTO = 60

# Tipos de imagem aceitos para o cabeçalho e a extensão com que cada um é salvo.
IMAGENS_ACEITAS = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}

# Quando o canal não sobe imagem própria, o cabeçalho usa esta pose do mascote
# (servida em `public/mascote/`), que é a que o canal já tem em todo render.
POSE_PADRAO_DO_CABECALHO = "apresentador"


class EstiloDePalcoInvalido(PedidoInvalido):
    """O estilo informado não existe."""


class FundoDePalcoInvalido(PedidoInvalido):
    """O fundo informado não existe."""


class OpcaoDePalcoInvalida(PedidoInvalido):
    """Uma escolha do palco (fundo do short, estilo da legenda) fora da lista."""


# Posição e tamanho (D-911): todo componente fixo do palco diz ONDE fica e de
# QUE tamanho, em px do quadro (1920x1080 no horizontal, 1080x1920 no short).
# Os padrões são os números que o estilo limpo usava cravados — quem nunca
# mexeu vê o mesmo palco.
ESCALA_MINIMA, ESCALA_MAXIMA = 0.5, 2.0
HORIZONTAL = (1920, 1080)
VERTICAL = (1080, 1920)
CONTORNO_MAXIMO = 80
CONTORNO_PADRAO = 32


@dataclass(frozen=True)
class Posicao:
    """Onde um componente senta, ou `automatica` para a regra do estilo."""

    automatica: bool = True
    x: int = 0
    y: int = 0


@dataclass(frozen=True)
class Cabecalho:
    """Quem fala: imagem + nome + @, no canto do palco."""

    ativo: bool = True
    nome: str = ""
    """Vazio = o nome da identidade do canal."""
    handle: str = ""
    """Vazio = o handle da identidade do canal."""
    imagem: str = ""
    """Nome do arquivo subido pelo operador; vazio = a pose padrão do mascote."""
    escala: float = 1.0
    posicao: Posicao = Posicao(automatica=False, x=64, y=64)
    """No horizontal: sempre manual, com o canto superior esquerdo de padrão."""
    posicao_short: Posicao = Posicao()
    """No short: automática = na faixa acima da primeira janela."""


@dataclass(frozen=True)
class Placa:
    """A placa do interlocutor (nome + papel), que o corte preenche."""

    ativo: bool = True
    escala: float = 1.0
    posicao: Posicao = Posicao()
    """Automática = acima da tela, cedendo ao cabeçalho (`posicaoDaPlaca`)."""


@dataclass(frozen=True)
class PalcoComponentes:
    estilo: str = ESTILO_PADRAO
    cabecalho: Cabecalho = Cabecalho()
    placa: Placa = Placa()
    fundo: str = FUNDO_PADRAO
    """O fundo do estilo limpo (`FUNDOS`); o estilo atual tem o fundo do layout."""
    contorno_short: int = CONTORNO_PADRAO
    """Quanto as janelas do short recuam das bordas (px); 0 = sem contorno."""
    fundo_short: str = FUNDO_SHORT_PALCO
    """O que o short mostra em volta das janelas (`FUNDOS_DO_SHORT`)."""
    estilo_da_legenda: str = LEGENDA_CONTORNO
    """Como a legenda do short se separa do vídeo (`ESTILOS_DA_LEGENDA`)."""

    @property
    def eco_no_short(self) -> bool:
        """O short leva o eco do vídeo nas faixas: pedido E estilo limpo.

        Exemplos:
            >>> PalcoComponentes(estilo="limpo", fundo_short="eco").eco_no_short
            True
            >>> PalcoComponentes(estilo="atual", fundo_short="eco").eco_no_short
            False
        """
        return self.estilo == ESTILO_LIMPO and self.fundo_short == FUNDO_SHORT_ECO

    def para_dict(self) -> dict[str, Any]:
        return {
            "estilo": self.estilo,
            "fundo": self.fundo,
            "contorno_short": self.contorno_short,
            "fundo_short": self.fundo_short,
            "estilo_da_legenda": self.estilo_da_legenda,
            "cabecalho": {
                "ativo": self.cabecalho.ativo,
                "nome": self.cabecalho.nome,
                "handle": self.cabecalho.handle,
                "imagem": self.cabecalho.imagem,
                "escala": self.cabecalho.escala,
                "posicao": _posicao_para_dict(self.cabecalho.posicao),
                "posicao_short": _posicao_para_dict(self.cabecalho.posicao_short),
            },
            "placa": {
                "ativo": self.placa.ativo,
                "escala": self.placa.escala,
                "posicao": _posicao_para_dict(self.placa.posicao),
            },
        }


def _posicao_para_dict(posicao: Posicao) -> dict[str, Any]:
    return {"automatica": posicao.automatica, "x": posicao.x, "y": posicao.y}


PADRAO = PalcoComponentes()


def _texto(valor: Any, atual: str) -> str:
    if valor is None:
        return atual
    return str(valor).strip()[:_TAMANHO_MAXIMO_DO_TEXTO]


def _booleano(valor: Any, atual: bool) -> bool:
    if valor is None:
        return atual
    return bool(valor)


def _estilo(valor: Any, atual: str) -> str:
    if valor is None:
        return atual
    estilo = str(valor).strip().lower()
    if estilo not in ESTILOS:
        raise EstiloDePalcoInvalido(
            f"Estilo de palco desconhecido: {valor!r}. Use um de: {', '.join(ESTILOS)}."
        )
    return estilo


def _numero(valor: Any, atual: float, minimo: float, maximo: float) -> float:
    if valor is None:
        return atual
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return atual
    return max(minimo, min(maximo, numero))


def _posicao(valor: Any, atual: Posicao, quadro: tuple[int, int]) -> Posicao:
    """A posição depois da edição, presa dentro do quadro."""
    if not isinstance(valor, dict):
        return atual
    return Posicao(
        automatica=_booleano(valor.get("automatica"), atual.automatica),
        x=int(_numero(valor.get("x"), atual.x, 0, quadro[0])),
        y=int(_numero(valor.get("y"), atual.y, 0, quadro[1])),
    )


def _fundo(valor: Any, atual: str) -> str:
    if valor is None:
        return atual
    fundo = str(valor).strip().lower()
    if fundo not in FUNDOS:
        raise FundoDePalcoInvalido(
            f"Fundo de palco desconhecido: {valor!r}. Use um de: {', '.join(FUNDOS)}."
        )
    return fundo


def _escolha(valor: Any, atual: str, opcoes: tuple[str, ...], campo: str) -> str:
    if valor is None:
        return atual
    escolha = str(valor).strip().lower()
    if escolha not in opcoes:
        raise OpcaoDePalcoInvalida(
            f"{campo} desconhecido: {valor!r}. Use um de: {', '.join(opcoes)}."
        )
    return escolha


def mesclar(atual: PalcoComponentes, mudancas: dict[str, Any] | None) -> PalcoComponentes:
    """Os componentes depois de uma edição parcial: só o que veio muda.

    Campo ausente ou `None` fica como estava; é o que deixa a tela salvar um
    interruptor sem reenviar o resto. Estilo desconhecido é erro, não silêncio:
    um palco com estilo inválido renderizaria o de sempre e o operador acharia
    que a escolha não pegou.

    Exemplos:
        >>> mesclar(PADRAO, {"estilo": "limpo"}).estilo
        'limpo'
        >>> mesclar(PADRAO, {"cabecalho": {"nome": "  Pedro  "}}).cabecalho.nome
        'Pedro'
        >>> mesclar(PADRAO, {"cabecalho": {"ativo": False}}).cabecalho.handle
        ''
        >>> mesclar(PADRAO, {"fundo": "Linho"}).fundo
        'linho'
        >>> mesclar(PADRAO, {"cabecalho": {"escala": 9}}).cabecalho.escala
        2.0
        >>> mesclar(PADRAO, {"placa": {"posicao": {"automatica": False, "x": 5000}}}).placa.posicao
        Posicao(automatica=False, x=1920, y=0)
        >>> mesclar(PADRAO, None) == PADRAO
        True
    """
    if not isinstance(mudancas, dict):
        return atual

    cabecalho = atual.cabecalho
    novo_cabecalho = mudancas.get("cabecalho")
    if isinstance(novo_cabecalho, dict):
        cabecalho = replace(
            cabecalho,
            ativo=_booleano(novo_cabecalho.get("ativo"), cabecalho.ativo),
            nome=_texto(novo_cabecalho.get("nome"), cabecalho.nome),
            handle=_texto(novo_cabecalho.get("handle"), cabecalho.handle),
            imagem=_texto(novo_cabecalho.get("imagem"), cabecalho.imagem),
            escala=_numero(
                novo_cabecalho.get("escala"), cabecalho.escala, ESCALA_MINIMA, ESCALA_MAXIMA
            ),
            posicao=_posicao(novo_cabecalho.get("posicao"), cabecalho.posicao, HORIZONTAL),
            posicao_short=_posicao(
                novo_cabecalho.get("posicao_short"), cabecalho.posicao_short, VERTICAL
            ),
        )

    placa = atual.placa
    nova_placa = mudancas.get("placa")
    if isinstance(nova_placa, dict):
        placa = replace(
            placa,
            ativo=_booleano(nova_placa.get("ativo"), placa.ativo),
            escala=_numero(nova_placa.get("escala"), placa.escala, ESCALA_MINIMA, ESCALA_MAXIMA),
            posicao=_posicao(nova_placa.get("posicao"), placa.posicao, HORIZONTAL),
        )

    return PalcoComponentes(
        estilo=_estilo(mudancas.get("estilo"), atual.estilo),
        cabecalho=cabecalho,
        placa=placa,
        fundo=_fundo(mudancas.get("fundo"), atual.fundo),
        contorno_short=int(
            _numero(mudancas.get("contorno_short"), atual.contorno_short, 0, CONTORNO_MAXIMO)
        ),
        fundo_short=_escolha(
            mudancas.get("fundo_short"), atual.fundo_short, FUNDOS_DO_SHORT, "Fundo do short"
        ),
        estilo_da_legenda=_escolha(
            mudancas.get("estilo_da_legenda"),
            atual.estilo_da_legenda,
            ESTILOS_DA_LEGENDA,
            "Estilo da legenda",
        ),
    )


def normalizar(dados: Any) -> PalcoComponentes:
    """Os componentes a partir do que foi gravado, tolerando o que não bate.

    Diferente de `mesclar`, aqui um estilo desconhecido cai no padrão: o que
    está no banco pode ter sido escrito por uma versão que ainda tinha aquele
    estilo, e um registro antigo não pode derrubar um render.

    Exemplos:
        >>> normalizar({"estilo": "limpo", "placa": {"ativo": False}}).placa.ativo
        False
        >>> normalizar({"estilo": "nao-existe"}).estilo
        'atual'
        >>> normalizar({"fundo": "sumiu"}).fundo
        'reticula-aurora'
        >>> normalizar(None) == PADRAO
        True
    """
    if not isinstance(dados, dict):
        return PADRAO
    base = dict(dados)
    try:
        _estilo(base.get("estilo"), ESTILO_PADRAO)
    except EstiloDePalcoInvalido:
        base["estilo"] = ESTILO_PADRAO
    if base.get("fundo") is not None and str(base["fundo"]).strip().lower() not in FUNDOS:
        base["fundo"] = FUNDO_PADRAO
    for campo, opcoes in (
        ("fundo_short", FUNDOS_DO_SHORT),
        ("estilo_da_legenda", ESTILOS_DA_LEGENDA),
    ):
        if base.get(campo) is not None and str(base[campo]).strip().lower() not in opcoes:
            base.pop(campo)
    return mesclar(PADRAO, base)


def com_handle(handle: str) -> str:
    """O handle com UM `@` na frente, como aparece no palco.

    Exemplos:
        >>> com_handle("pedroivosa")
        '@pedroivosa'
        >>> com_handle("@pedroivosa")
        '@pedroivosa'
        >>> com_handle("")
        ''
    """
    limpo = handle.strip().lstrip("@")
    return f"@{limpo}" if limpo else ""


def props_para_renderer(
    componentes: PalcoComponentes,
    *,
    nome_do_canal: str,
    handle_do_canal: str,
    imagem_servida: str,
) -> dict[str, Any]:
    """O que o rasterizador do palco recebe, já com os textos resolvidos.

    O cabeçalho vazio herda da identidade do canal: o operador que não digitou
    nada vê o nome e o @ que o canal já tem, em vez de um cabeçalho em branco.
    `imagem_servida` é o caminho relativo ao `public/` do renderer — quem sabe
    qual arquivo está servido é o serviço, não este módulo.

    Exemplos:
        >>> props = props_para_renderer(
        ...     mesclar(PADRAO, {"estilo": "limpo"}),
        ...     nome_do_canal="Pedro Ivo", handle_do_canal="@pedroivosa",
        ...     imagem_servida="mascote/apresentador.png")
        >>> props["estilo"], props["cabecalho"]["nome"], props["cabecalho"]["handle"]
        ('limpo', 'Pedro Ivo', '@pedroivosa')
    """
    cabecalho = componentes.cabecalho
    return {
        "estilo": componentes.estilo,
        "fundo": componentes.fundo,
        "contorno_short": componentes.contorno_short,
        # O PNG do short com eco deixa o fundo transparente: quem pinta as
        # faixas é o FFmpeg, com o vídeo desfocado por baixo.
        "eco_no_short": componentes.eco_no_short,
        "cabecalho": {
            "ativo": cabecalho.ativo,
            "nome": cabecalho.nome or nome_do_canal.strip(),
            "handle": com_handle(cabecalho.handle or handle_do_canal),
            "imagem": imagem_servida,
            "escala": cabecalho.escala,
            "posicao": _posicao_para_dict(cabecalho.posicao),
            "posicao_short": _posicao_para_dict(cabecalho.posicao_short),
        },
        "placa": {
            "ativo": componentes.placa.ativo,
            "escala": componentes.placa.escala,
            "posicao": _posicao_para_dict(componentes.placa.posicao),
        },
    }


def extensao_da_imagem(content_type: str) -> str:
    """A extensão com que a imagem do cabeçalho é salva, pelo content-type.

    Exemplos:
        >>> extensao_da_imagem("image/png")
        '.png'
        >>> extensao_da_imagem("text/plain")
        Traceback (most recent call last):
        ...
        app.domain.compartilhado.erros.PedidoInvalido: ...
    """
    extensao = IMAGENS_ACEITAS.get((content_type or "").lower().split(";")[0].strip())
    if extensao is None:
        raise PedidoInvalido(
            f"Imagem do cabeçalho em formato não aceito: {content_type or 'desconhecido'}. "
            f"Aceitos: {', '.join(sorted(IMAGENS_ACEITAS))}."
        )
    return extensao
