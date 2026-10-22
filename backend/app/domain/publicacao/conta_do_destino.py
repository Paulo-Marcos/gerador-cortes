"""A conta em que cada destino publica, conferida antes do envio (RN-31, D-980).

Cada canal guarda as credenciais e as sessões de navegador na sua pasta, e é
isso que faz o canal A não publicar no B. Mas ninguém olhava QUEM estava dentro
da pasta: um login com a conta errada na janela do robô, ou um token de outra
conta, publicava ali sem aviso. A regra fecha esse buraco:

  - o canal guarda, por destino, a conta esperada;
  - antes de cada envio o robô lê a conta logada e compara pelo identificador
    estável (o id), nunca pelo nome, que o dono troca quando quer;
  - sem conta esperada gravada, a primeira conta vista é aprendida — o canal
    não para de publicar no dia do deploy, e daí em diante só ela passa;
  - mas nunca a conta que já é de OUTRO canal: é o caso do token único do
    Instagram no `.env`, ou do login do canal A feito na janela do canal B,
    antes do primeiro envio — aprender ali seria gravar o erro;
  - conta que não se deixa ler também barra: na dúvida, não publica.

Trocar de conta de propósito é "esquecer" a gravada na tela de Canais; o envio
seguinte aprende a nova.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.compartilhado.erros import PedidoInvalido, ServicoExternoFalhou

# A ordem é a da tela. O Instagram aparece duas vezes porque a API e o navegador
# enxergam a conta por números diferentes: o id da Graph API não é o da sessão
# do instagram.com, e comparar um com o outro barraria a conta certa.
ROTULOS: dict[str, str] = {
    "youtube": "YouTube",
    "tiktok": "TikTok",
    "instagram": "Instagram (API)",
    "instagram_web": "Instagram (navegador)",
}
DESTINOS: tuple[str, ...] = tuple(ROTULOS)


@dataclass(frozen=True)
class Conta:
    """Quem está logado num destino. `id` decide; `nome` é só para a tela."""

    id: str
    nome: str = ""

    def legivel(self) -> str:
        return f"{self.nome} ({self.id})" if self.nome else self.id


class ContaDivergente(PedidoInvalido):
    """A conta logada não é a que o canal espera: o envio não sai."""


class ContaIlegivel(ServicoExternoFalhou):
    """Não deu para saber qual conta está logada: o envio não sai."""


def destino_conhecido(destino: str) -> str:
    if destino not in ROTULOS:
        raise PedidoInvalido(f"destino desconhecido: {destino!r}")
    return destino


def conferir(
    destino: str, esperada: Conta | None, logada: Conta, *, dono_da_logada: str = ""
) -> bool:
    """Deixa o envio seguir ou o barra. `True` = aprender a `logada` (RN-31).

    `dono_da_logada` é o OUTRO canal que já tem a `logada` gravada, se houver.
    Levanta `ContaIlegivel` sem id lido e `ContaDivergente` quando o id lido
    não é o esperado — ou, sem esperado, quando ele já é de outro canal.
    """
    rotulo = ROTULOS[destino_conhecido(destino)]
    if not logada.id.strip():
        raise ContaIlegivel(
            f"Não consegui confirmar qual conta está logada no {rotulo}, e por isso "
            "não enviei. Se a janela do robô pedir login, entre na conta do canal "
            "ali (uma vez só) e envie de novo."
        )
    if esperada is None:
        if dono_da_logada:
            raise ContaDivergente(
                f"Envio recusado: o {rotulo} está logado em {logada.legivel()}, que já "
                f"é a conta do canal {dono_da_logada}. Entre na conta deste canal (na "
                "janela do robô, ou refazendo a autorização) e envie de novo."
            )
        return True
    if esperada.id.strip() != logada.id.strip():
        raise ContaDivergente(
            f"Envio recusado: o {rotulo} está logado em {logada.legivel()}, mas este "
            f"canal publica em {esperada.legivel()}. Entre na conta certa (na janela do "
            "robô, ou refazendo a autorização do YouTube) — ou, se trocou de conta de "
            "propósito, clique em Esquecer na tela de Canais e envie de novo."
        )
    return False
