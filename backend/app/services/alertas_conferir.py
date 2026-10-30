"""O alerta "conferir" do corte (D-998): dispensar, dividir e juntar.

Quem cria o alerta é a geração de trechos (`CorteService.gerar_trechos_via_claude`);
a regra mora em `domain/corte/alerta_conferir`. Dividir e juntar ficam aqui, e
não no `corte.py`, que está no teto da catraca de tamanho (D-771).
"""

import json

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.alerta_conferir import (
    alertas_gravados,
    dividir_alertas_no_ponto,
    juntar_alertas,
    marcar_conferido,
)
from app.models import Corte
from sqlalchemy import select
from sqlalchemy.orm import selectinload


def dividir_alertas(corte: Corte, ponto_seg: float) -> str:
    """Deixa no corte os alertas da esquerda do ponto e devolve os da direita, em JSON.

    Sem isto a metade nova nascia sem os alertas que lhe pertencem.
    """
    esquerda, direita = dividir_alertas_no_ponto(
        alertas_gravados(corte.alertas_conferir), ponto_seg
    )
    corte.alertas_conferir = json.dumps(esquerda, ensure_ascii=False)
    return json.dumps(direita, ensure_ascii=False)


def juntar_alertas_dos_cortes(primeiro: Corte, segundo: Corte) -> None:
    """O corte que sobrevive à junção leva os alertas do que é apagado."""
    juntos = juntar_alertas(
        alertas_gravados(primeiro.alertas_conferir), alertas_gravados(segundo.alertas_conferir)
    )
    primeiro.alertas_conferir = json.dumps(juntos, ensure_ascii=False)


async def marcar_alerta_conferido(corte_id: str, alerta_id: str) -> Corte:
    """Marca o alerta como conferido e devolve o corte. Desvios e líquido não mudam."""
    async with AsyncSessionLocal() as db, db.begin():
        resultado = await db.execute(
            select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
        )
        corte = resultado.scalar_one_or_none()
        if corte is None:
            raise NaoEncontrado("Corte não encontrado")
        alertas = marcar_conferido(alertas_gravados(corte.alertas_conferir), alerta_id)
        corte.alertas_conferir = json.dumps(alertas, ensure_ascii=False)
    return corte
