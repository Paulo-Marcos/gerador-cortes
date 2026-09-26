"""Erros de domínio: o que deu errado, dito pelo significado, sem HTTP (D-697).

Antes cada router decidia o status da resposta, caso a caso, e para isso tinha
de conhecer o que acontecia lá dentro. Agora quem sabe o que deu errado — o
service, o domínio — levanta um destes erros com a mensagem para o operador, e
um tratador global (`routers/errors.registrar_tratadores`) escolhe o status pelo
significado. O router só chama.

A lista cresce quando um caso de uso precisar de um significado que ainda não
existe; não se cria significado para o futuro.
"""


class ErroDeDominio(Exception):
    """Base. A mensagem é para o operador e chega inteira à tela."""


class NaoEncontrado(ErroDeDominio):
    """O que foi pedido não existe."""


class ServicoExternoFalhou(ErroDeDominio):
    """Um serviço de fora (API, CLI) respondeu com erro."""


class ConfiguracaoAusente(ErroDeDominio):
    """Falta uma configuração da instalação — chave, canal, arquivo de credencial."""


class PedidoInvalido(ErroDeDominio):
    """O pedido não cabe no estado atual — ex.: reanalisar um projeto sem transcrição."""
