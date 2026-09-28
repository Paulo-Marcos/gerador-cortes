"""A fábrica de shorts pelo caminho manual: regerar o bruto e propor os shorts (D-755).

Mora aqui, acima dos shorts e do export, porque os dois se pediam coisas: a
fábrica pedia o bruto ao export, e o export, ao fim do bruto de um corte Fire,
pede os shorts (D-455). Com os dois pedidos passando pelos shorts, eles e o
export se importavam. Aqui o caminho manual fala com os dois, e cada um deles
fala só para baixo.
"""

from __future__ import annotations

import logging

from app.database import AsyncSessionLocal
from app.models import Projeto
from app.services import shorts
from app.services.bruto_progress import BrutoProgress
from app.services.export import ExportService
from app.services.ingestao import IngestaoService
from app.services.tasks import fire_and_forget

logger = logging.getLogger(__name__)

# D-803: o andamento da fabrica de cada live, em memoria — o mesmo padrao do
# `BrutoProgress`. Vale para o processo do backend; um reinicio o esquece, e a
# tela volta a oferecer o botao, que e o certo: nada mais esta rodando.
_andamento: dict[str, dict] = {}


async def gerar_shorts_do_corte(corte_id: str) -> dict:
    """Caminho MANUAL da fabrica: regera o bruto se preciso e propoe os shorts.

    Serve os cortes que o automatico nao alcanca — os que ja tinham bruto antes
    da E-030, os que tiveram o bruto descartado, e o teste da esteira sem
    reprocessar a live inteira.

    O ponto delicado e a regeneracao do bruto. Ela roda com
    `refazer_transcricao=False, refazer_cenas=False`, o modo que a D-160 criou
    justamente para isto: refaz o VIDEO e nao encosta no texto nem nas cenas.
    Assim a pos-producao ja feita — cenas, layout, metadados, thumbnail —
    sobrevive intacta; o que muda no banco e so o ponteiro do clip e a duracao,
    que sao recalculados iguais porque as bordas do corte nao mudaram.

    Levanta `LookupError` (corte inexistente) e `ValueError` (corte sem Fire, ou
    bruto que nao pode ser regerado).
    """
    estado = await shorts.elegibilidade(corte_id)
    if not estado["elegivel"]:
        raise ValueError(
            "Este corte nao esta na fabrica de shorts. Marque o Fire, ou indique-o "
            "para shorts, e tente de novo."
        )

    regerou = False
    if not estado["tem_bruto"]:
        # Mesma checagem do caminho explicito: sem a live, o FFmpeg falharia com
        # uma mensagem que nao diz o que fazer.
        await shorts.exigir_video_da_live(corte_id)
        await _regerar_bruto_preservando_pos_producao(corte_id)
        regerou = True

    # D-803: o bruto de um Fire ja propoe os shorts no fim (D-455). Chamar a IA
    # de novo aqui pagaria minutos por uma rodada que a regra da soma (RN-26)
    # descartaria quase inteira. So roda se aquele passo nao aconteceu ou falhou.
    if regerou and _bruto_ja_propos_shorts(corte_id):
        resultado: dict = {"shorts": [], "descartes": []}
    else:
        resultado = await shorts.sugerir_shorts(corte_id)
    logger.info(
        "[Shorts] geracao manual corte=%s bruto_regerado=%s candidatos=%d",
        corte_id[:8],
        regerou,
        len(resultado.get("shorts", [])),
    )
    return {**resultado, "bruto_regerado": regerou}


async def _regerar_bruto_preservando_pos_producao(corte_id: str) -> None:
    """Refaz so o video do bruto — nem transcricao, nem cenas (D-160)."""
    resultado = await ExportService.gerar_bruto_via_worker(
        corte_id, refazer_transcricao=False, refazer_cenas=False
    )
    if resultado.get("status") != "pronto":
        raise ValueError(
            f"Nao consegui regerar o bruto: {resultado.get('mensagem', 'erro desconhecido')}"
        )


def _bruto_ja_propos_shorts(corte_id: str) -> bool:
    return any(
        passo["chave"] == "shorts" and passo["status"] == "concluido"
        for passo in BrutoProgress.get(corte_id)
    )


def andamento_das_lives() -> list[dict]:
    """O que a fabrica de cada live esta fazendo, ou como terminou (D-803)."""
    return [dict(estado) for estado in _andamento.values()]


async def disparar_fabrica_da_live(projeto_id: str) -> dict:
    """Um clique por live: baixa a live se preciso, refaz os brutos, propoe os shorts.

    Existe porque os Fires de uma live dividem a mesma materia-prima. Resolver
    corte a corte baixaria a live uma vez por Fire — e a live limpa e justamente
    o caso em que ha varios Fires parados de uma vez.

    Entram os Fires e indicados ainda abertos (sem `shorts_finalizados_em`) que
    estao sem bruto ou sem candidato. O trabalho roda em segundo plano; a tela
    acompanha por `andamento_das_lives`.

    Levanta `LookupError` (live inexistente) e `ValueError` (ja em andamento,
    nada a fazer, ou live limpa sem URL de origem).
    """
    if _andamento.get(projeto_id, {}).get("etapa") in ("baixando", "gerando"):
        raise ValueError("A fabrica desta live ja esta em andamento.")
    async with AsyncSessionLocal() as db:
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            raise LookupError(f"Live {projeto_id!r} nao encontrada")
        tem_url = bool(projeto.youtube_url)
        rebaixando = bool(projeto.rebaixando_video)

    pendentes = await _fires_pendentes(projeto_id)
    if not pendentes:
        raise ValueError("Nenhum Fire desta live esta sem bruto ou sem short.")
    baixar_live = any(not f["tem_bruto"] for f in pendentes) and not pendentes[0]["live_em_disco"]
    if baixar_live and rebaixando:
        raise ValueError("O download desta live ja esta em andamento. Espere terminar.")
    if baixar_live and not tem_url:
        raise ValueError("A live foi limpa e nao tem URL de origem para baixar de novo.")

    _andamento[projeto_id] = {
        "projeto_id": projeto_id,
        "etapa": "baixando" if baixar_live else "gerando",
        "feitos": 0,
        "total": len(pendentes),
        "erros": [],
    }
    fire_and_forget(
        _fabricar_live(projeto_id, pendentes, baixar_live), name=f"fabrica-live-{projeto_id[:8]}"
    )
    return {"projeto_id": projeto_id, "cortes": len(pendentes), "baixar_live": baixar_live}


async def _fires_pendentes(projeto_id: str) -> list[dict]:
    """Na ordem dos cortes da live, que e a ordem em que o operador os conhece."""
    pendentes = [
        fire
        for fire in await shorts.listar_fires_com_bruto()
        if fire["projeto_id"] == projeto_id
        and not fire["finalizado_em"]
        and (not fire["tem_bruto"] or fire["shorts"]["total"] == 0)
    ]
    return sorted(pendentes, key=lambda fire: fire["numero"])


async def _fabricar_live(projeto_id: str, pendentes: list[dict], baixar_live: bool) -> None:
    estado = _andamento[projeto_id]
    try:
        if baixar_live:
            await _rebaixar_a_live(projeto_id)
            estado["etapa"] = "gerando"
        # Um de cada vez, de proposito: cada bruto e FFmpeg sobre a live inteira
        # e cada proposta e uma chamada de IA. Em paralelo eles so disputariam a
        # maquina com o que o operador estiver fazendo.
        for fire in pendentes:
            try:
                await gerar_shorts_do_corte(fire["corte_id"])
            except Exception as exc:  # noqa: BLE001 — um corte que cai nao para os outros
                rotulo = fire["titulo"] or f"Corte {fire['numero']}"
                estado["erros"].append(f"{rotulo}: {exc}")
            estado["feitos"] += 1
        estado["etapa"] = "concluido"
    except Exception as exc:  # noqa: BLE001 — tarefa de fundo: a falha vai para o andamento
        estado["etapa"] = "erro"
        estado["erros"].append(str(exc))
        logger.exception("[Shorts] fabrica da live %s falhou", projeto_id[:8])


async def _rebaixar_a_live(projeto_id: str) -> None:
    """O mesmo download da D-527, esperado ate o fim; falha vira `ValueError`."""
    async with AsyncSessionLocal() as db, db.begin():
        projeto = await db.get(Projeto, projeto_id)
        if projeto:
            projeto.rebaixando_video = True
            projeto.progresso_download = 0
    await IngestaoService.rebaixar_video(projeto_id)
    async with AsyncSessionLocal() as db:
        projeto = await db.get(Projeto, projeto_id)
        if not projeto or not shorts.live_em_disco(projeto):
            raise ValueError("Nao consegui baixar a live de novo. Veja o log da ingestao.")
