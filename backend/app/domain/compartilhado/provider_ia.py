"""Qual IA atende uma geração: a assinatura do Claude ou a do Antigravity.

Módulo próprio, e não uma constante em `services/claude_ia`, porque os routers
precisam do TIPO no topo do arquivo (é anotação de query param) enquanto importam
o serviço tarde, dentro da função, para não fechar ciclo de import. Aqui não há
dependência nenhuma, então qualquer camada pode importar sem risco.
"""

from typing import Literal

ProviderIA = Literal["claude", "gemini"]


def provider_do_modelo(model: str | None) -> ProviderIA | None:
    """Qual assinatura atendeu, a partir do nome do modelo gravado.

    É assim que a tela marca uma geração antiga sem precisar de coluna nova em
    cada tabela: o nome do modelo já viaja na telemetria e na avaliação do bruto.
    """
    if not model:
        return None
    return "gemini" if "gemini" in model.lower() else "claude"
