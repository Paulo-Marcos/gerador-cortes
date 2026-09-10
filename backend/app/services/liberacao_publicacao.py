"""Liberar um corte para ser publicado de novo (D-566).

O serviço é fino de propósito: quem sabe ONDE cada destino guarda a marca é o
domínio (`domain/liberacao_publicacao.py`); aqui só abrimos o banco, apagamos
o que ele apontou e contamos o que aconteceu.

Duas decisões que valem o comentário:

* **Liberar um destino que nunca publicou não é erro.** É um no-op explícito
  (`liberado=False`), porque o operador que clica duas vezes não fez nada
  errado — e transformar isso em 4xx só ensinaria a tela a ter medo do botão.
* **A resposta diz se o MP4 final está no disco.** Depois do upload a retenção
  pode ter apagado `upload_ready/video.mp4` (D-512), e sem ele o botão de
  enviar não volta — o corte precisa de render novo. Sem esse aviso, liberar
  pareceria não ter funcionado.
"""

from __future__ import annotations

from app.channel_paths import projetos_dir
from app.database import AsyncSessionLocal
from app.domain.liberacao_publicacao import (
    MarcaDePublicacao,
    destinos_conhecidos,
    marca_do_destino,
)
from app.models import Corte
from app.services.app_logging import operational_info


async def liberar_publicacao(corte_id: str, destino: str) -> dict:
    """Apaga as marcas de publicação de UM destino, devolvendo o corte à fila.

    Retorna sempre um dict com `status` ('ok' | 'erro'), e no caso feliz também
    `liberado` (havia marca?), `campos_limpos` e `video_pronto`.
    """
    marca = marca_do_destino(destino)
    if not marca:
        validos = ", ".join(destinos_conhecidos())
        return {
            "status": "erro",
            "mensagem": f"Destino desconhecido: {destino!r}. Destinos válidos: {validos}.",
        }

    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            return {"status": "erro", "mensagem": "Corte não encontrado"}

        campos_limpos = _apagar_marcas(corte, marca)
        video_pronto = _video_final_existe(corte)
        await db.commit()

    if campos_limpos:
        operational_info(
            "Publicacao",
            f"🔓 Corte {corte_id} liberado em {marca.rotulo} "
            f"(marcas apagadas: {', '.join(campos_limpos)})",
        )

    return {
        "status": "ok",
        "corte_id": corte_id,
        "destino": marca.destino,
        "rotulo": marca.rotulo,
        "liberado": bool(campos_limpos),
        "campos_limpos": campos_limpos,
        "video_pronto": video_pronto,
        "mensagem": _mensagem(marca.rotulo, bool(campos_limpos), video_pronto),
    }


def _apagar_marcas(corte: Corte, marca: MarcaDePublicacao) -> list[str]:
    """Zera os campos do destino e devolve quais estavam de fato preenchidos.

    Ler ANTES de apagar é o que separa "liberei" de "não havia nada a liberar" —
    a diferença entre as duas mensagens que o operador vê.
    """
    preenchidos = [campo for campo in marca.campos if _tem_marca(getattr(corte, campo, None))]
    for campo, vazio in marca.limpar:
        setattr(corte, campo, vazio)
    return preenchidos


def _video_final_existe(corte: Corte) -> bool:
    """O MP4 de publicação ainda está na pasta? Sem ele não há o que subir."""
    caminho = projetos_dir() / corte.projeto_id / "cortes" / corte.id / "upload_ready" / "video.mp4"
    return caminho.exists()


def _tem_marca(valor: object) -> bool:
    """Marca preenchida — cobre string vazia e `None` sem perguntar o tipo."""
    return valor is not None and valor != ""


def _mensagem(rotulo: str, liberado: bool, video_pronto: bool) -> str:
    if not liberado:
        return f"Este corte já não constava como publicado no {rotulo}."
    if not video_pronto:
        return (
            f"Liberado no {rotulo} — mas o vídeo final não está mais na pasta; "
            "rode o render de novo antes de subir."
        )
    return f"Liberado no {rotulo}. O corte voltou para a fila de publicação."
