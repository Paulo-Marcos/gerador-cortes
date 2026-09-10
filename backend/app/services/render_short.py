"""Render do short vertical, de ponta a ponta (D-466).

Três passos, despachados ao Native Worker pela mesma fila do pipeline horizontal:

  1. **recorte** — extrai o trecho do bruto já em 9:16 e com o filtro aplicado;
  2. **camada** — o Remotion desenha cenas + legenda em ProRes 4444 com alpha;
  3. **composição** — a camada entra por cima e sai o MP4 de publicação.

Por que o vídeo NÃO é montado dentro do Remotion, numa composição só: a grade
tem de rodar antes do texto. Filtro aplicado depois mexeria na cor da legenda,
que já foi desenhada certa. É a mesma ordem que o horizontal usa — e reusar a
ordem conhecida significa reusar também o worker, o gate de RAM e o diagnóstico
que já existem para ela.

Os artefatos ficam em `cortes/<corte>/shorts/<short>/`: o intermediário some na
limpeza junto com o resto da mídia pesada, e o final é o que a publicação leva.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from app.channel_assets_sync import cor_do_tema
from app.channel_paths import para_relativo_ao_projeto, projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain import gancho_short, moldura_short
from app.domain.ffmpeg_short import (
    build_composicao_short_cmd,
    build_palco_vertical_cmd,
    build_recorte_vertical_cmd,
)
from app.domain.formato_video import VERTICAL, Resolucao
from app.domain.fundo_short import para_ffmpeg
from app.domain.moldura_short import COR_PADRAO, faixas
from app.domain.overlay_codec import OverlayCodec, overlay_codec_profile
from app.domain.youtube_layout import FUNDO_PADRAO as FUNDO_EDITORIAL_PADRAO
from app.domain.youtube_layout import _normalizar_fundo as textura_valida
from app.infrastructure.ffmpeg_runner import probe_resolucao
from app.infrastructure.worker_queue import RemotionWorkerQueue, WorkerJob, WorkerJobCategory
from app.models import Corte, Short, StatusShort
from app.services import legendas_short, palco_shorts
from app.services.app_settings import AppSettingsService
from app.services.pipeline_render_helpers import _build_overlay_render_cmd
from app.services.shorts import foco_efetivo
from app.services.shorts_progress import ShortsProgress
from app.services.tasks import fire_and_forget

logger = logging.getLogger(__name__)

COMPOSICAO_CAMADA = "CamadaShort"
_TIMEOUT_RECORTE_SEG = 900.0
_TIMEOUT_CAMADA_SEG = 1800.0
_TIMEOUT_COMPOSICAO_SEG = 900.0
# O bundle cacheado é do pipeline horizontal; aqui o entrypoint cru basta e evita
# acoplar o short à invalidação de fingerprint do outro caminho (D-190).
_ENTRYPOINT_REMOTION = "src/index.ts"


@dataclass(frozen=True)
class ResultadoRender:
    """O MP4 pronto, onde ele ficou, e de onde veio a legenda."""

    arquivo: Path
    caminho_relativo: str
    fonte_legenda: str
    palavras: int


async def renderizar_previa(short_id: str) -> dict:
    """Produz a PRÉVIA do short: vertical com legenda e cenas, SEM o filtro (D-483).

    Existe para o operador julgar enquadramento, legenda e cenas antes de gastar
    a passada boa. O que ela NÃO é: um passo intermediário do final. O filtro
    roda junto com o recorte e antes do overlay de propósito — aplicado depois,
    mexeria na cor da legenda já desenhada. Então finalizar reprocessa do zero,
    e este arquivo é descartável.

    Não mexe no `status`: prévia não é decisão de curadoria, é rascunho.
    """
    resultado = await _produzir(short_id, com_filtro=False, nome="previa.mp4")
    await _gravar_caminho(short_id, resultado, final=False)
    return {
        "arquivo_previa_path": resultado.caminho_relativo,
        "fonte_legenda": resultado.fonte_legenda,
        "palavras": resultado.palavras,
    }


async def renderizar_short(short_id: str) -> dict:
    """Produz o MP4 final do short e marca o candidato como renderizado.

    É o que a publicação leva: recorte + filtro + legenda + cenas. Roda direto,
    sem exigir prévia — quem confia no candidato não precisa passar por ela.

    Levanta `LookupError` (short/corte inexistente) e `ValueError` (sem bruto em
    disco ou intervalo impossível). Falha de render propaga: diferente da
    sugestão, aqui o arquivo É a entrega.
    """
    resultado = await _produzir(short_id, com_filtro=True, nome="short.mp4")
    await _gravar_caminho(short_id, resultado, final=True)
    return {
        "arquivo_short_path": resultado.caminho_relativo,
        "fonte_legenda": resultado.fonte_legenda,
        "palavras": resultado.palavras,
    }


def disparar(short_id: str, *, final: bool) -> dict:
    """Põe o render em segundo plano e devolve na hora (D-485).

    Síncrono, o POST segurava o navegador por mais de cinco minutos: a aba
    ficava presa, e uma queda de conexão perdia o retorno mesmo com o arquivo
    já pronto em disco. Agora quem acompanha é `GET /{id}/progresso`.

    Recusa disparar por cima de um render em curso. Dois renders do mesmo short
    escreveriam no mesmo arquivo ao mesmo tempo — e o segundo ainda sobrescreveria
    os passos do primeiro, deixando a tela mentindo sobre qual deles está rodando.
    """
    if ShortsProgress.em_curso(short_id):
        raise ValueError("Este short ja tem um render em andamento.")

    estagio = "final" if final else "previa"
    ShortsProgress.iniciar(short_id, estagio=estagio)
    fire_and_forget(
        _renderizar_em_background(short_id, final=final),
        name=f"short-{estagio}-{short_id[:8]}",
    )
    return {"status": "iniciado", "short_id": short_id, "estagio": estagio}


async def _renderizar_em_background(short_id: str, *, final: bool) -> None:
    """Roda o render e garante que a falha chegue ao store.

    Sem o `except`, um erro morreria no log do worker e a tela ficaria em
    "rodando" para sempre — pior que o silêncio que esta demanda veio resolver.
    """
    try:
        if final:
            await renderizar_short(short_id)
        else:
            await renderizar_previa(short_id)
        ShortsProgress.concluir(short_id)
    except Exception as exc:  # noqa: BLE001 — a falha PRECISA chegar a tela
        logger.exception("[RenderShort] short=%s falhou", short_id[:8])
        ShortsProgress.falhar(short_id, str(exc) or exc.__class__.__name__)


async def _produzir(short_id: str, *, com_filtro: bool, nome: str) -> ResultadoRender:
    """Os três passos do render. Prévia e final diferem só no filtro e no nome.

    Os intermediários levam o nome do estágio no arquivo: rodar a prévia e
    depois finalizar não pode fazer um sobrescrever o base do outro no meio do
    caminho.
    """
    contexto = await _montar_contexto(short_id)
    legenda = await legendas_short.montar_do_short(
        contexto.corte_id, contexto.inicio_seg, contexto.fim_seg
    )

    estagio = "final" if com_filtro else "previa"
    saida_dir = contexto.diretorio
    saida_dir.mkdir(parents=True, exist_ok=True)
    base = saida_dir / f"base_{estagio}.mp4"
    camada = saida_dir / f"camada_{estagio}.mov"
    final = saida_dir / nome

    ShortsProgress.marcar(short_id, "recorte", "rodando")
    await _despachar(
        f"{short_id}_{estagio}_recorte",
        _comando_do_quadro(contexto, base, com_filtro=com_filtro),
        cwd=saida_dir,
        category=WorkerJobCategory.GRADE,
        timeout=_TIMEOUT_RECORTE_SEG,
    )

    ShortsProgress.marcar(short_id, "recorte", "concluido")

    props_file = saida_dir / f"camada_{estagio}.props.json"
    props_file.write_text(
        json.dumps(
            {
                "cenas": contexto.cenas,
                "gancho": contexto.gancho,
                "captions": legenda.captions,
                "duracaoSeg": contexto.duracao_seg,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    ShortsProgress.marcar(short_id, "camada", "rodando")
    await _despachar(
        f"{short_id}_{estagio}_camada",
        _build_overlay_render_cmd(
            composition=COMPOSICAO_CAMADA,
            bundle_arg=_ENTRYPOINT_REMOTION,
            output_path=camada,
            props_file=props_file,
            concurrency=2,
            # ProRes 4444 é o único codec com alpha confiável neste projeto.
            codec_profile=overlay_codec_profile(OverlayCodec.PRORES_4444),
        ),
        cwd=_renderer_dir(),
        category=WorkerJobCategory.OVERLAY,
        timeout=_TIMEOUT_CAMADA_SEG,
    )

    ShortsProgress.marcar(short_id, "camada", "concluido")

    ShortsProgress.marcar(short_id, "composicao", "rodando")
    await _despachar(
        f"{short_id}_{estagio}_composicao",
        build_composicao_short_cmd(base, camada, final),
        cwd=saida_dir,
        category=WorkerJobCategory.RENDER_FINAL,
        timeout=_TIMEOUT_COMPOSICAO_SEG,
    )

    ShortsProgress.marcar(short_id, "composicao", "concluido")

    logger.info(
        "[RenderShort] short=%s estagio=%s pronto (legenda: %s, %d palavras)",
        short_id[:8],
        estagio,
        legenda.fonte,
        legenda.total,
    )
    return ResultadoRender(
        arquivo=final,
        caminho_relativo=para_relativo_ao_projeto(final, contexto.projeto_id),
        fonte_legenda=legenda.fonte,
        palavras=legenda.total,
    )


@dataclass(frozen=True)
class _ContextoRender:
    short_id: str
    corte_id: str
    projeto_id: str
    bruto: Path
    diretorio: Path
    inicio_seg: float
    fim_seg: float
    foco_x: float
    filtro: str | None
    cenas: list[dict]
    # D-565: o titulo-gancho da abertura, ou None quando este short nao tem.
    # Campo PROPRIO, fora de `cenas`: as cenas estao desligadas (`CENAS_LIGADAS`)
    # e o gancho nao pode depender daquele interruptor — nem ser religado por ele.
    gancho: dict | None
    # D-481: a resolucao MEDIDA do bruto. Nao tem default de proposito — foi um
    # default (HORIZONTAL) que fez o crop 9:16 ser calculado sobre 1920x1080 num
    # bruto 720p e estourar o quadro.
    origem: Resolucao
    # E-036/D-488: o palco deste short, ou None quando o corte nao tem regiao.
    plano: object
    origem_palco: str
    # D-501: as faixas do canal, ja resolvidas com a cor do tema.
    moldura: list
    # D-499: a cor de fundo do palco, ja resolvida na paleta do canal.
    fundo: str
    # D-508: o PNG do palco (fundo com textura + chrome), ou None quando nao ha
    # o que desenhar — sem regiao, moldura desligada, ou o gerador falhou.
    palco_png: object

    @property
    def duracao_seg(self) -> float:
        return round(self.fim_seg - self.inicio_seg, 2)


async def _montar_contexto(short_id: str) -> _ContextoRender:
    # I-023: o filtro de render e GLOBAL (Ajustes), nao por corte.
    filtro = AppSettingsService.get().filtro_global_padrao or None

    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        if short.fim_seg <= short.inicio_seg:
            raise ValueError("O short tem intervalo vazio ou invertido.")

        bruto = _bruto_em_disco(corte)
        if bruto is None:
            raise ValueError(
                "O bruto deste corte nao esta mais em disco — sem ele nao da para recortar."
            )

        origem = await _medir(bruto)

    palco = await palco_shorts.resolver_para_render(short_id)

    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        corte = await db.get(Corte, short.corte_id)

        return _ContextoRender(
            short_id=short.id,
            corte_id=corte.id,
            projeto_id=corte.projeto_id,
            bruto=bruto,
            diretorio=projetos_dir() / corte.projeto_id / "cortes" / corte.id / "shorts" / short.id,
            inicio_seg=float(short.inicio_seg),
            fim_seg=float(short.fim_seg),
            foco_x=foco_efetivo(short, corte),
            filtro=filtro,
            cenas=[] if not CENAS_LIGADAS else _json_lista(short.cenas_remotion),
            gancho=gancho_short.para_payload(
                short.gancho_tela,
                short.gancho_ate_seg,
                duracao_short_seg=float(short.fim_seg) - float(short.inicio_seg),
            ),
            origem=origem,
            plano=palco["plano"],
            origem_palco=palco["origem"],
            moldura=faixas_do_canal(palco["moldura"]),
            fundo=para_ffmpeg(palco["fundo"]),
            palco_png=await _palco_em_png(palco),
        )


async def _palco_em_png(palco: dict):
    """O PNG do palco deste short, ou `None` para seguir sem ele (D-508).

    O fundo EDITORIAL (a textura) e a cor do fundo são coisas diferentes: a cor
    preenche o que sobra dentro do ffmpeg, e a textura vem no PNG. Enquanto o
    seletor da tela ainda oferece cores da paleta, a textura fica no default do
    canal — trocá-la é a D-509.
    """
    from app.services import palco_short_png

    if moldura_short.Moldura(palco["moldura"]) is moldura_short.Moldura.NENHUMA:
        return None

    plano = palco.get("plano")
    if plano is None:
        # D-543: sem plano de palco o render degrada para o recorte 9:16 do
        # quadro cru — mas a MOLDURA nao precisa degradar junto. Aqui a janela e
        # uma so, o que sobra entre as duas faixas, e o palco texturizado serve
        # aos dois caminhos. Sem isto, um corte sem preset saia com duas barras
        # de verde chapado.
        janela = moldura_short.janela_entre_as_faixas(palco["moldura"])
        return await palco_short_png.obter(_textura(palco), [janela] if janela else [])

    janelas = [recorte.janela for recorte in plano.recortes]
    return await palco_short_png.obter(_textura(palco), janelas)


# D-560: as cenas estao DESLIGADAS.
#
# "E tudo texto, e jogar texto no shorts acho que e ruim. Ja tem a legenda,
# ficar adicionando mais texto polui demais." A legenda ja ocupa a faixa de
# leitura do short, e as cenas empilhavam um segundo bloco de texto por cima.
#
# Desligar aqui, e nao so esconder a UI: um short gravado com cenas continuaria
# renderizando o texto delas para sempre, e o operador nao teria mais onde
# apaga-las. O dado fica no banco — nada e destruido, e religar e mudar esta
# constante de volta.
CENAS_LIGADAS = False


def _textura(palco: dict) -> str:
    """A textura escolhida para este short, ou a padrao do canal (D-552).

    O PNG e a PREVIA leem daqui. Duas fontes para este id fariam a tela e o
    arquivo divergirem sem nada quebrar — que e como a D-549 nasceu.
    """
    # D-554: `or` so pega o vazio. Um id que nao e textura (uma chave de
    # paleta vinda de preset antigo) passaria por aqui e o rasterizador
    # procuraria um fundo inexistente.
    return textura_valida(palco.get("fundo_editorial"), FUNDO_EDITORIAL_PADRAO)


def faixas_do_canal(moldura: str) -> list:
    """As faixas da moldura com a cor do canal, prontas para o filtro."""
    return faixas(moldura, cor_do_tema("verdeMoldura", COR_PADRAO))


def _comando_do_quadro(contexto: _ContextoRender, saida: Path, *, com_filtro: bool) -> list[str]:
    """O palco quando ha regiao; o recorte 9:16 do quadro cru quando nao ha.

    Degradar e melhor que falhar: um corte sem preset aplicado continua virando
    short, do jeito que virava antes. Mas o log diz que foi degradacao — sem
    isso o operador veria o chrome da live de volta e nao saberia que a causa e
    a falta de regiao, nao o palco (E-036/D-488).
    """
    filtro = contexto.filtro if com_filtro else None
    if contexto.plano is None:
        logger.info(
            "[Palco] short=%s sem regiao (%s) — recorte do quadro cru",
            contexto.short_id[:8],
            contexto.origem_palco,
        )
        return build_recorte_vertical_cmd(
            contexto.bruto,
            saida,
            inicio_seg=contexto.inicio_seg,
            duracao_seg=contexto.duracao_seg,
            foco_x=contexto.foco_x,
            filtro=filtro,
            origem=contexto.origem,
            destino=VERTICAL,
        )

    logger.info(
        "[Palco] short=%s modelo=%s regioes=%s",
        contexto.short_id[:8],
        contexto.plano.modelo.id,
        [r.regiao for r in contexto.plano.recortes],
    )
    return build_palco_vertical_cmd(
        contexto.bruto,
        saida,
        inicio_seg=contexto.inicio_seg,
        duracao_seg=contexto.duracao_seg,
        plano=contexto.plano,
        moldura=contexto.moldura,
        fundo_cor=contexto.fundo,
        palco_png=contexto.palco_png,
        filtro=filtro,
    )


async def _medir(bruto: Path) -> Resolucao:
    """A resolucao real do bruto (D-481).

    Falha ALTO em vez de assumir 1920x1080. Um palpite errado aqui nao produz um
    short torto: produz um crop maior que o quadro, e o ffmpeg aborta com -22 no
    meio do render, com uma mensagem que nao aponta para a causa. Se o ffprobe
    nao le o arquivo, o ffmpeg tambem nao leria — melhor dizer isso agora.
    """
    medida = await probe_resolucao(bruto)
    if medida is None:
        raise ValueError(
            f"Nao consegui medir a resolucao de {bruto.name} — sem ela o recorte 9:16 "
            "seria um chute e o ffmpeg falharia no meio do render."
        )
    return Resolucao(largura=medida[0], altura=medida[1])


def _bruto_em_disco(corte: Corte) -> Path | None:
    if not corte.arquivo_clip_path:
        return None
    caminho = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    return caminho if caminho.is_file() else None


async def _gravar_caminho(short_id: str, resultado: ResultadoRender, *, final: bool) -> None:
    """Aponta o short para o arquivo que acabou de sair.

    Só o FINAL mexe no status: `renderizado` significa "há o que publicar", e a
    prévia não é publicável. Carimbá-la faria o painel de publicação aparecer
    sobre um arquivo sem filtro.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            return
        if final:
            short.arquivo_short_path = resultado.caminho_relativo
            short.status = StatusShort.RENDERIZADO
        else:
            short.arquivo_previa_path = resultado.caminho_relativo
        await db.commit()


async def _despachar(
    job_id: str,
    cmd: list[str],
    *,
    cwd: Path,
    category: WorkerJobCategory,
    timeout: float,
) -> None:
    """Envia um passo ao Native Worker e espera terminar."""
    logger.info("[RenderShort] job %s -> %s", job_id, " ".join(cmd[:6]))
    fila_dir = projetos_dir() / "fila_remotion"
    fila_dir.mkdir(parents=True, exist_ok=True)
    await RemotionWorkerQueue(fila_dir).submit_and_wait(
        WorkerJob(
            id=job_id, cmd=[str(c) for c in cmd], cwd=cwd, category=category, timeout_sec=timeout
        )
    )


def _renderer_dir() -> Path:
    """Raiz do `video-renderer`, de onde o `npx remotion` precisa rodar."""
    return Path(__file__).resolve().parents[3] / "video-renderer"


def _json_lista(bruto: str | None) -> list[dict]:
    try:
        dados = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    return dados if isinstance(dados, list) else []
