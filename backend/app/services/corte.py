"""
Serviço de Cortes — integrações pós-análise via IA e utilitários
"""

import asyncio
import json
import logging
import shutil
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.channel_paths import projetos_dir
from app.database import AsyncSessionLocal
from app.domain import ciclo_corte, segmentos_short
from app.domain.corte_mapper import (
    cenas_fora_do_corte,
    extrair_cenas_remotion,
    normalizar_cenas_remotion_payload,
    tem_colapso_de_tempos_das_cenas,
)
from app.domain.desvio_categoria import SILENCIO, classificar_desvio
from app.domain.ffmpeg_basic import (
    build_silence_detect_proxy_cmd,
    build_silence_detect_video_cmd,
)
from app.domain.juncao_cortes import (
    CAMPOS_TEMPO_CENA,
    CAMPOS_TEMPO_REGIAO,
    CAMPOS_TEMPO_SEGMENTO,
    deslocar_tempos,
    duracao_liquida,
    emendar_texto,
    juntar_desvios,
)
from app.domain.ordem_cortes import CorteOrdenavel, ordenar_por_tempo, pins_para_ordem
from app.domain.reading_metadata import (
    aplicar_emojis_texto_capa,
    aplicar_prefixo_leitura_titulo,
    remover_prefixo_leitura_titulo,
)
from app.domain.segment_calculator import dividir_desvios_no_ponto, normalizar_desvio
from app.domain.snap_desvios import snap_desvio_a_palavras
from app.domain.time_convert import hms_to_seg, seg_to_hms, to_seg, to_seg_estrito
from app.domain.youtube_layout import normalizar_layout_youtube
from app.models import Corte, MetadadoCorte, Projeto, Short, StatusCorte
from app.provider_ia import ProviderIA
from app.services.app_logging import operational_debug, operational_error
from app.services.claude_ia import (
    ClaudeIaService,
    _carregar_transcricao_raw,
    _mapa_falantes_para_meta,
)
from app.services.thumbnail import ThumbnailService
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

# Margem mínima (s) que cada metade precisa ter para a divisão ser válida —
# evita criar cortes degenerados quando o ponteiro fica colado na borda.
_MARGEM_DIVISAO_SEG = 0.5


async def _recusar_juncao_invalida(db: AsyncSession, primeiro: Corte, segundo: Corte) -> None:
    """Barra as junções que produziriam um corte incoerente (D-575).

    Levanta ValueError com a razão; o router traduz para 400.

    - **Projetos diferentes**: os tempos medem lives distintas; somar não
      significa nada.
    - **Já publicado**: juntar reescreveria um vídeo que está no ar.
    - **Corte no meio**: o vão entre os dois vira trecho removido, e esse vão
      engoliria inteiro o corte do meio — que continuaria existindo, agora
      sobreposto ao mesclado.
    """
    if primeiro.projeto_id != segundo.projeto_id:
        raise ValueError("Só dá para juntar cortes do mesmo projeto.")

    publicado = next((c for c in (primeiro, segundo) if (c.youtube_video_id or "").strip()), None)
    if publicado is not None:
        raise ValueError(
            f"O corte #{publicado.numero} já foi publicado no YouTube; "
            "juntar mudaria um vídeo que já está no ar."
        )

    entre = await db.execute(
        select(func.count())
        .select_from(Corte)
        .where(
            Corte.projeto_id == primeiro.projeto_id,
            Corte.id.notin_([primeiro.id, segundo.id]),
            Corte.inicio_seg >= float(primeiro.fim_seg or 0.0),
            Corte.inicio_seg < float(segundo.inicio_seg or 0.0),
        )
    )
    if entre.scalar_one() > 0:
        raise ValueError("Há outro corte entre os dois. Junte primeiro os vizinhos imediatos.")


def _desvios_do_corte(corte: Corte) -> list[dict]:
    """Lê os trechos a remover do corte, tolerando JSON corrompido."""
    try:
        desvios = json.loads(corte.desvios or "[]")
    except json.JSONDecodeError:
        logger.warning(
            "[corte] desvios do corte %s corrompidos (JSON inválido); assumindo lista vazia.",
            corte.id,
        )
        return []
    return desvios if isinstance(desvios, list) else []


def _lista_json(bruto: str) -> list:
    """Parse tolerante de coluna que guarda lista JSON (cenas, segmentos)."""
    try:
        valor = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    if isinstance(valor, dict):
        valor = valor.get("cenas", [])
    return valor if isinstance(valor, list) else []


def _juntar_marcacoes_de_bruto(primeiro: Corte, segundo: Corte, offset_seg: float) -> None:
    """Traz para o primeiro corte tudo que é marcado em tempo de BRUTO (D-575).

    Cenas, regiões do layout e segmentos detectados do segundo corte andam
    `offset_seg` para a frente — a duração líquida do primeiro —, porque na
    timeline mesclada o material dele só começa depois que o primeiro termina.

    Do layout, só as REGIÕES se juntam. Modo padrão, fundo, placa e a geometria
    da compartilhada são decisões únicas sobre o corte inteiro: ficam as do
    primeiro, que é quem sobrevive.
    """
    primeiro.cenas_remotion = json.dumps(
        [
            *_lista_json(primeiro.cenas_remotion),
            *deslocar_tempos(_lista_json(segundo.cenas_remotion), offset_seg, CAMPOS_TEMPO_CENA),
        ],
        ensure_ascii=False,
    )

    primeiro.segmentos_detectados = json.dumps(
        [
            *_lista_json(primeiro.segmentos_detectados),
            *deslocar_tempos(
                _lista_json(segundo.segmentos_detectados), offset_seg, CAMPOS_TEMPO_SEGMENTO
            ),
        ],
        ensure_ascii=False,
    )

    layout = normalizar_layout_youtube(_dict_json(primeiro.layout_youtube))
    regioes_segundo = normalizar_layout_youtube(_dict_json(segundo.layout_youtube)).get(
        "regioes", []
    )
    layout["regioes"] = [
        *layout.get("regioes", []),
        *deslocar_tempos(regioes_segundo, offset_seg, CAMPOS_TEMPO_REGIAO),
    ]
    primeiro.layout_youtube = json.dumps(normalizar_layout_youtube(layout), ensure_ascii=False)

    # Palco e preset de recortes: o do primeiro manda; herda o do segundo só
    # quando o primeiro nunca escolheu (chave vazia é herança, não decisão).
    primeiro.palco_padrao = primeiro.palco_padrao or segundo.palco_padrao
    primeiro.palco_short_preset = primeiro.palco_short_preset or segundo.palco_short_preset


def _dict_json(bruto: str) -> dict:
    """Parse tolerante de coluna que guarda objeto JSON (layout)."""
    try:
        valor = json.loads(bruto or "{}")
    except json.JSONDecodeError:
        return {}
    return valor if isinstance(valor, dict) else {}


def _juntar_texto_editorial(primeiro: Corte, segundo: Corte) -> None:
    """Emenda o texto que é matéria-prima dos metadados; o resto fica do primeiro.

    Título, tema, frase-gancho e score descrevem a ENTRADA do corte, e a entrada
    do corte mesclado continua sendo a do primeiro. Já resumo e justificativa
    descrevem o CONTEÚDO — jogar fora os do segundo apagaria em silêncio uma
    rodada de análise.
    """
    primeiro.resumo = emendar_texto(primeiro.resumo, segundo.resumo)
    primeiro.justificativa = emendar_texto(primeiro.justificativa, segundo.justificativa)
    primeiro.hints_thumbnail = emendar_texto(primeiro.hints_thumbnail, segundo.hints_thumbnail)


async def _adotar_filhos_do_corte(
    db: AsyncSession, primeiro: Corte, segundo: Corte, offset_seg: float
) -> None:
    """Move shorts (e o metadado órfão) do corte absorvido para o sobrevivente.

    Sem isto o `cascade="all, delete-orphan"` apagaria os shorts junto com o
    corte — trechos já curados a mão, que ninguém pediu para perder. Os tempos
    do short são do BRUTO (invariante declarada no modelo), então andam pelo
    mesmo offset das cenas.

    O metadado só é adotado quando o sobrevivente ainda não tem um: título,
    descrição e capa são uma escolha só por corte, e a do primeiro prevalece.

    A adoção termina com `flush` + `expire`: sem isso o `delete` do corte
    absorvido recarrega as relações dele, ainda vê os filhos que acabamos de
    remarcar e os apaga pelo cascade — o metadado sumia mesmo depois de já
    pertencer ao sobrevivente.
    """
    shorts = (await db.execute(select(Short).where(Short.corte_id == segundo.id))).scalars().all()
    for short in shorts:
        short.corte_id = primeiro.id
        short.inicio_seg = round(float(short.inicio_seg or 0.0) + offset_seg, 3)
        short.fim_seg = round(float(short.fim_seg or 0.0) + offset_seg, 3)
        # D-604: a colagem anda junto. Sem isto, fundir dois cortes deslocaria o
        # envelope e deixaria os segmentos no lugar antigo — o short renderizaria
        # pedacos de outro assunto, e o envelope diria que esta tudo certo.
        short.segmentos = segmentos_short.para_json(
            [
                segmentos_short.Segmento(
                    round(segmento.inicio_seg + offset_seg, 3),
                    round(segmento.fim_seg + offset_seg, 3),
                )
                for segmento in segmentos_short.de_json(short.segmentos)
            ]
        )
        short.cenas_remotion = json.dumps(
            deslocar_tempos(_lista_json(short.cenas_remotion), offset_seg, CAMPOS_TEMPO_CENA),
            ensure_ascii=False,
        )

    if primeiro.metadado is None:
        metadado = (
            await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == segundo.id))
        ).scalar_one_or_none()
        if metadado is not None:
            metadado.corte_id = primeiro.id

    await db.flush()
    db.expire(segundo, ["metadado", "shorts"])


def _apagar_pasta_do_corte(projeto_id: str, corte_id: str) -> None:
    """Remove a pasta do corte absorvido — mesmo gesto do DELETE /cortes/{id}."""
    pasta = projetos_dir() / projeto_id / "cortes" / corte_id
    if pasta.exists():
        shutil.rmtree(pasta, ignore_errors=True)


# Artefatos derivados do span do corte. Ao juntar, todos passam a cobrir só a
# primeira metade — nenhum é aproveitável nem parcialmente (o contrário do
# `dividir`, onde o bruto ainda serve para a metade esquerda).
_ARTEFATOS_DE_VIDEO = ("graded", "overlays", "temp", "upload_ready")


def _apagar_artefatos_de_video(projeto_id: str, corte_id: str) -> None:
    """Apaga bruto, grade, overlays e render final do corte mesclado (D-575).

    Deixá-los em disco seria pior que apagá-los: `_corte_ja_gerou_bruto` olha o
    ARQUIVO, não o banco, então a UI anunciaria "bruto pronto" para um vídeo que
    termina no meio do corte — e o render final partiria dele. A thumbnail não
    entra na lista: é arte editorial, não deriva do span.
    """
    pasta = projetos_dir() / projeto_id / "cortes" / corte_id
    if not pasta.exists():
        return
    for bruto in pasta.glob("clip_raw*"):
        _remover_caminho(bruto)
    for nome in _ARTEFATOS_DE_VIDEO:
        _remover_caminho(pasta / nome)


def _remover_caminho(caminho: Path) -> None:
    """Apaga arquivo ou diretório sem explodir quando ele já não existe."""
    if caminho.is_dir():
        shutil.rmtree(caminho, ignore_errors=True)
    elif caminho.exists():
        caminho.unlink(missing_ok=True)


def _ordenavel(corte: Corte) -> CorteOrdenavel:
    """Projeção do corte para o domínio da ordem (D-448) — só tempo e pin."""
    return CorteOrdenavel(
        id=corte.id,
        inicio_seg=float(corte.inicio_seg or 0.0),
        posicao_fixada=corte.posicao_fixada,
    )


@dataclass(frozen=True)
class AtualizarCorteDTO:
    """Atualização parcial de um corte (PATCH /cortes/{id}).

    Espelha o request HTTP mantendo o serviço livre de FastAPI/pydantic. Todo
    campo é opcional: `None` significa "não mexer". O router converte o
    `AtualizarCorteRequest` neste DTO.
    """

    titulo_proposto: str | None = None
    inicio_hms: str | None = None
    fim_hms: str | None = None
    inicio_seg: float | None = None
    fim_seg: float | None = None
    desvios: list | None = None
    status: str | None = None
    is_leitura: int | None = None
    autor_leitura: str | None = None
    parte_leitura: int | None = None
    transcricao_corte: list | None = None
    cenas_remotion: list | dict | None = None
    layout_youtube: dict | None = None
    hints_thumbnail: str | None = None
    audio_offset_ms: int | None = None


class CorteService:
    @staticmethod
    async def atualizar(db: AsyncSession, corte_id: str, dados: AtualizarCorteDTO) -> Corte:
        """Aplica uma atualização parcial a um corte (handler PATCH /cortes/{id}).

        Migrado do router em D-076 — comportamento preservado. Cobre: campos
        escalares, desvios/transcrição, normalização + validação de colapso das
        cenas Remotion, invalidação da marca `cenas_validadas` quando cenas ou
        layout mudam, prefixo de leitura no metadado e o commit. A
        re-sincronização da transcrição roda fora da transação principal, como
        antes.

        Levanta `ValueError("...não encontrado")` quando o corte não existe e
        `ValueError(<motivo>)` quando o salvamento das cenas é bloqueado por
        colapso de tempos — o router mapeia para 404/400.
        """
        result = await db.execute(
            select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
        )
        corte = result.scalar_one_or_none()
        if not corte:
            raise ValueError("Corte não encontrado")
        # D-665: antes de tocar em qualquer campo — um status recusado não pode
        # deixar a atualização pela metade. `TransicaoDeCorteInvalida` é um
        # ValueError, e o router já a devolve como 400 com o motivo.
        if dados.status is not None:
            # `.value`: em memória o status pode ser o enum, e `str()` de um enum
            # misto devolve 'StatusCorte.APROVADO' no Python 3.13, não 'aprovado'.
            atual = getattr(corte.status, "value", corte.status)
            ciclo_corte.validar_pedido_do_operador(atual, dados.status)

        if dados.titulo_proposto is not None:
            corte.titulo_proposto = dados.titulo_proposto
        if dados.inicio_hms is not None:
            corte.inicio_hms = dados.inicio_hms
        if dados.fim_hms is not None:
            corte.fim_hms = dados.fim_hms
        if dados.inicio_seg is not None:
            corte.inicio_seg = dados.inicio_seg
        if dados.fim_seg is not None:
            corte.fim_seg = dados.fim_seg
        if dados.desvios is not None:
            corte.desvios = json.dumps(dados.desvios)
        # D-576: mexeu na borda, o arranjo de blocos acompanha. Descartá-lo seria
        # perder o trabalho do editor por causa de um ajuste de meio segundo;
        # confiar nele cegamente mandaria o ffmpeg cortar fora do intervalo.
        # `reconciliar` estica as fatias até o novo intervalo mantendo a ORDEM.
        if dados.inicio_seg is not None or dados.fim_seg is not None:
            from app.domain.arranjo_blocos import parse as parse_arranjo
            from app.domain.arranjo_blocos import reconciliar, serializar

            arranjo = parse_arranjo(corte.arranjo_blocos)
            if arranjo:
                corte.arranjo_blocos = json.dumps(
                    serializar(
                        reconciliar(
                            arranjo, float(corte.inicio_seg or 0.0), float(corte.fim_seg or 0.0)
                        )
                    ),
                    ensure_ascii=False,
                )
        if dados.status is not None:
            corte.status = dados.status
        if dados.is_leitura is not None:
            corte.is_leitura = dados.is_leitura
        if dados.autor_leitura is not None:
            corte.autor_leitura = dados.autor_leitura.strip()
        if dados.parte_leitura is not None:
            corte.parte_leitura = max(1, dados.parte_leitura)
        if dados.transcricao_corte is not None:
            corte.transcricao_corte = json.dumps(dados.transcricao_corte, ensure_ascii=False)
        if dados.hints_thumbnail is not None:
            corte.hints_thumbnail = dados.hints_thumbnail.strip()
        if dados.audio_offset_ms is not None:
            # Lip-sync: limite generoso de ±10s evita valores absurdos vindos da UI.
            corte.audio_offset_ms = max(-10_000, min(10_000, int(dados.audio_offset_ms)))
        if dados.cenas_remotion is not None:
            cenas_recebidas = extrair_cenas_remotion(dados.cenas_remotion)
            if tem_colapso_de_tempos_das_cenas(cenas_recebidas):
                raise ValueError(
                    "Salvamento bloqueado: os tempos das cenas seriam sobrescritos em massa."
                )
            # Teto: o span BRUTO do corte, nunca a duracao liquida. O bruto e
            # sempre >= a liquida, entao um trecho removido jamais gera falso
            # positivo — so acusa cena inequivocamente fora (tempo absoluto da
            # live vazando para o roteiro visual).
            fora = cenas_fora_do_corte(
                cenas_recebidas, (corte.fim_seg or 0) - (corte.inicio_seg or 0)
            )
            if fora:
                exemplo = fora[0]
                raise ValueError(
                    f"Salvamento bloqueado: {len(fora)} cena(s) com tempo fora do corte "
                    f"(ex.: cena {exemplo['indice']} em {exemplo['inicio']:.1f}s-"
                    f"{exemplo['fim']:.1f}s). Tempo de cena e relativo ao corte, "
                    "nao a posicao na live."
                )
            cenas_remotion = normalizar_cenas_remotion_payload(dados.cenas_remotion)
            novo_payload = json.dumps(cenas_remotion, ensure_ascii=False)
            # Se as cenas mudaram, invalida a marca manual de "cenas validadas" — o
            # operador precisa revalidar conscientemente. Comparar pelo JSON serializado
            # com NORMALIZACAO em ambos os lados, para evitar invalidar a marca apenas
            # porque o banco tem dados antigos (ex.: tela_cheia sem modelo_cena, que
            # passa a ganhar 'card' apos I-031).
            existente_normalizado = normalizar_cenas_remotion_payload(
                json.loads(corte.cenas_remotion or "[]")
            )
            existente_payload = json.dumps(existente_normalizado, ensure_ascii=False)
            if existente_payload != novo_payload:
                corte.cenas_validadas = 0
                corte.cenas_validadas_em = None
            corte.cenas_remotion = novo_payload

        if dados.layout_youtube is not None:
            layout_youtube = normalizar_layout_youtube(dados.layout_youtube)
            novo_layout = json.dumps(layout_youtube, ensure_ascii=False)
            operational_debug("DB-DEBUG", ">>> INICIANDO ATUALIZAÇÃO DO LAYOUT DO CORTE <<<")
            operational_debug("DB-DEBUG", f"Recebido do Frontend: {dados.layout_youtube}")
            operational_debug("DB-DEBUG", f"Normalizado e pronto para gravar: {novo_layout}")
            if (getattr(corte, "layout_youtube", "") or "") != novo_layout:
                corte.cenas_validadas = 0
                corte.cenas_validadas_em = None
            corte.layout_youtube = novo_layout

        if corte.metadado and (
            dados.is_leitura is not None
            or dados.autor_leitura is not None
            or dados.parte_leitura is not None
        ):
            corte.metadado.titulo_youtube = (
                aplicar_prefixo_leitura_titulo(
                    corte.metadado.titulo_youtube, corte.autor_leitura, corte.parte_leitura
                )
                if corte.is_leitura
                else remover_prefixo_leitura_titulo(corte.metadado.titulo_youtube)
            )
            corte.metadado.texto_capa = aplicar_emojis_texto_capa(
                corte.metadado.texto_capa,
                bool(corte.metadado.is_fire),
                bool(corte.is_leitura),
            )

        await db.commit()

        if dados.layout_youtube is not None:
            # Consulta explícita pós-commit para comprovar gravação no banco
            res = await db.execute(select(Corte.layout_youtube).where(Corte.id == corte.id))
            valor_salvo = res.scalar_one_or_none()
            operational_debug(
                "DB-DEBUG",
                f"Verificação pós-commit (SELECT no banco para o corte): {valor_salvo}",
            )
            operational_debug("DB-DEBUG", ">>> LAYOUT DO CORTE ATUALIZADO COM SUCESSO <<<")

        if dados.desvios is not None or dados.inicio_seg is not None or dados.fim_seg is not None:
            await CorteService.sincronizar_transcricao_corte(corte_id)

        # D-448: mexer no início move o corte na linha do tempo — a lista precisa
        # acompanhar, senão a ordem volta a ser a de criação.
        if dados.inicio_seg is not None or dados.inicio_hms is not None:
            await CorteService.renumerar_por_tempo(db, corte.projeto_id)

        # A moldura da capa lê as mesmas marcas que o 📖 do texto e o prefixo do
        # título, aplicados logo acima. Marcar Leitura depois que a capa entrou é
        # o caminho normal — o julgamento vem na revisão, a arte às vezes chega
        # antes —, e sem isto a moldura ficaria congelada na marca antiga.
        if dados.is_leitura is not None:
            await ThumbnailService.reaplicar_moldura(corte_id)

        await db.refresh(corte)
        return corte

    @staticmethod
    async def analisar_desvios_todos_impl(projeto_id: str, provider: str = "claude"):
        import asyncio

        from app.database import AsyncSessionLocal
        from app.models import Corte
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))
            todos = result.scalars().all()
            corte_ids = [c.id for c in todos]

        for cid in corte_ids:
            try:
                await CorteService.gerar_trechos_via_claude(cid, provider)
                await asyncio.sleep(1)
            except Exception as e:
                operational_error("AnalisarDesvios", f"Erro no corte {cid}: {e}")

    @staticmethod
    async def gerar_trechos_via_claude(corte_id: str, provider: ProviderIA = "claude") -> dict:
        """Regenera os trechos a remover (desvios) de um corte via Claude e
        ressincroniza a transcrição final. Usa a skill `trechos-expert`.

        D-332 (aditivo puro): "gerar trechos" é CUMULATIVO como a análise
        (D-298) — soma os desvios novos, pula os que praticamente coincidem com
        um já marcado, e NUNCA remove nem ajusta o que já existe (manual OU
        claude). A revisão automática da D-302 foi REVOGADA: uma regeração não
        pode mais apagar o trabalho de marcação anterior.
        Em projeto diarizado, os chunks saem com o rótulo de falante
        ([CANAL]/[OUTRO]) para a regra "pausa por troca de falante não é
        enrolação" funcionar.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")
            if not corte.transcricao_corte:
                raise ValueError("Corte sem transcrição bruta. Rode 'refazer transcrição' antes.")
            transcricao_bruta = json.loads(corte.transcricao_corte)
            meta = {
                "corte_id": corte_id,  # D-353: contexto p/ telemetria da geração
                "projeto_id": corte.projeto_id,
                "titulo": corte.titulo_proposto or "",
                "tema_central": corte.tema_central or "",
                "inicio_hms": corte.inicio_hms or "",
                "fim_hms": corte.fim_hms or "",
            }
            desvios_existentes = [normalizar_desvio(d) for d in json.loads(corte.desvios or "[]")]
            corte_inicio_seg = to_seg_estrito(corte.inicio_seg or 0)
            corte_fim_seg = to_seg_estrito(corte.fim_seg or 0)
            # D-286/D-302: a transcricao_corte não guarda `speaker` — o rótulo
            # vive na transcricao_raw do projeto; reanotamos antes do prompt.
            # D-339: a transcricao_raw também é a ÚNICA fonte do timing por palavra
            # (a transcricao_corte descarta `palavras`), então carregamos sempre —
            # não só quando há diarização.
            projeto = await db.get(Projeto, corte.projeto_id)
            mapa_falantes = (
                _mapa_falantes_para_meta(projeto.falantes_map) if projeto is not None else None
            )
            transcricao_raw_projeto = (
                _carregar_transcricao_raw(projeto.transcricao_raw, corte.projeto_id)
                if projeto is not None and projeto.transcricao_raw
                else []
            )

        if mapa_falantes and isinstance(transcricao_raw_projeto, list):
            transcricao_bruta = ClaudeIaService._anotar_falantes_do_projeto(
                transcricao_bruta, transcricao_raw_projeto
            )

        resultado = await ClaudeIaService.gerar_desvios(
            transcricao_bruta, meta, desvios_existentes, mapa_falantes, provider
        )
        # WHY: a `origem` (o provider que propôs) permite o frontend exibir o badge
        # (Bug-2 do I-020). D-332: aditivo puro — sem revisão dos existentes.
        # D-339: encaixa cada desvio NOVO na borda real de palavra (snap
        # determinístico) ANTES do merge. Só os desvios do Claude passam por aqui;
        # os já existentes (manual/técnico/claude anterior) ficam intocados. Sem
        # timing por palavra (corte antigo) `palavras_corte` sai vazia e o snap é
        # no-op — back-compat total.
        palavras_corte = ClaudeIaService._palavras_do_corte(
            transcricao_raw_projeto, corte_inicio_seg, corte_fim_seg
        )
        # D-355: quando o desvio traz a citação (inicio_texto/fim_texto), ancora a
        # borda na palavra real (busca janelada ~5s) ANTES do snap — o snap então
        # só faz o ajuste fino. Sem citação, ancoragem é no-op e o snap age sozinho.
        # D-422: `classificar_desvio` reconcilia a `categoria` devolvida pela skill
        # com o vocabulário canônico (e garante o aviso no motivo dos imprecisos)
        # antes de qualquer ajuste de borda — a UI badgeia o MOTIVO da remoção, não
        # a origem.
        normalizados_novos = [
            snap_desvio_a_palavras(
                ClaudeIaService._ancorar_desvio(
                    classificar_desvio(normalizar_desvio({**d, "origem": provider})),
                    palavras_corte,
                ),
                palavras_corte,
            )
            for d in resultado.get("desvios", [])
        ]
        mesclados, adicionados = ClaudeIaService._mesclar_desvios(
            desvios_existentes, normalizados_novos
        )

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")
            corte.desvios = json.dumps(mesclados, ensure_ascii=False)
            # D-334: conta esta invocação da skill trechos-expert — cobre tanto
            # o botão por-corte quanto o lote (analisar_desvios_todos_impl
            # chama esta mesma função por corte).
            corte.trechos_geracoes = (corte.trechos_geracoes or 0) + 1
            log = json.loads(corte.trechos_geracoes_log or "[]")
            log.append(
                {
                    "em": datetime.utcnow().isoformat(),
                    "adicionados": adicionados,
                    "total_apos": len(mesclados),
                }
            )
            corte.trechos_geracoes_log = json.dumps(log, ensure_ascii=False)
            await db.commit()

        # Ressincroniza a transcrição final aplicando o conjunto de desvios.
        await CorteService.sincronizar_transcricao_corte(corte_id)

        logger.info(
            "[ClaudeIA] Trechos via Claude p/ corte %s: +%d novos (total %d)",
            corte_id[:8],
            adicionados,
            len(mesclados),
        )
        return {
            "total_desvios": len(mesclados),
            "novos": adicionados,
        }

    @staticmethod
    async def dividir_corte(corte_id: str, ponto_seg: float) -> tuple[str, str]:
        """Divide um corte em dois no instante absoluto `ponto_seg` (F-061).

        O corte original passa a terminar no ponto; um novo corte nasce do
        ponto até o fim original. Os trechos a remover (desvios) são
        particionados pelo ponto — o desvio que o cruza é fatiado — para que
        nenhuma das metades perca marcações. Os cortes posteriores são
        renumerados para abrir espaço logo após o original. Re-sincroniza a
        transcrição dos dois cortes.

        Retorna (id_corte_original, id_corte_novo).
        Levanta ValueError se o corte não existir ou o ponto cair fora do
        intervalo (com a margem mínima de borda).
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado.")

            inicio = float(corte.inicio_seg or 0.0)
            fim = float(corte.fim_seg or 0.0)
            ponto = round(float(ponto_seg), 3)

            if not (inicio + _MARGEM_DIVISAO_SEG <= ponto <= fim - _MARGEM_DIVISAO_SEG):
                raise ValueError(
                    f"O ponto de divisão ({seg_to_hms(ponto)}) precisa ficar dentro "
                    f"do corte ({corte.inicio_hms} – {corte.fim_hms})."
                )

            try:
                desvios = json.loads(corte.desvios or "[]")
            except json.JSONDecodeError:
                logger.warning(
                    "[dividir] desvios do corte %s corrompidos (JSON inválido); "
                    "assumindo lista vazia.",
                    corte.id,
                )
                desvios = []
            desvios_esq, desvios_dir = dividir_desvios_no_ponto(desvios, ponto)

            # D-576: o arranjo é uma permutação do intervalo, então partir o
            # intervalo parte o arranjo. Cada metade fica com os blocos que lhe
            # cabem, esticados para ladrilhar a própria borda nova e NA ORDEM que
            # o editor tinha escolhido. Corte sem arranjo continua sem arranjo.
            from app.domain.arranjo_blocos import parse as parse_arranjo
            from app.domain.arranjo_blocos import reconciliar, serializar

            arranjo = parse_arranjo(corte.arranjo_blocos)
            arranjo_esq = serializar(reconciliar(arranjo, inicio, ponto))
            arranjo_dir = serializar(reconciliar(arranjo, ponto, fim))

            novo_id = str(uuid.uuid4())
            titulo_base = (corte.titulo_proposto or "").strip() or f"Corte #{corte.numero}"
            novo_corte = Corte(
                id=novo_id,
                projeto_id=corte.projeto_id,
                numero=corte.numero + 1,
                titulo_proposto=f"{titulo_base} (2)",
                resumo="",
                tema_central=corte.tema_central,
                inicio_hms=seg_to_hms(ponto),
                fim_hms=corte.fim_hms,
                inicio_seg=ponto,
                fim_seg=fim,
                desvios=json.dumps(desvios_dir, ensure_ascii=False),
                arranjo_blocos=json.dumps(arranjo_dir, ensure_ascii=False),
                status=StatusCorte.PROPOSTO,
                is_leitura=corte.is_leitura,
                autor_leitura=corte.autor_leitura,
                parte_leitura=(corte.parte_leitura or 1) + 1 if corte.is_leitura else 1,
            )
            db.add(novo_corte)

            # Encolhe o corte original até o ponto, mantendo só os desvios da
            # esquerda. Um bruto/cenas porventura já gerados ficam desatualizados
            # (a fronteira mudou) — mesmo contrato de editar o fim: o usuário
            # regenera quando quiser; não apagamos artefatos sem aviso.
            corte.fim_seg = ponto
            corte.fim_hms = seg_to_hms(ponto)
            corte.desvios = json.dumps(desvios_esq, ensure_ascii=False)
            corte.arranjo_blocos = json.dumps(arranjo_esq, ensure_ascii=False)

            await db.commit()
            # D-448: a metade nova entra logo depois da original porque começa
            # depois dela — quem abre espaço é a ordem cronológica, não um +1
            # manual nos posteriores.
            await CorteService.renumerar_por_tempo(db, corte.projeto_id)

        # Fora do bloco de escrita: re-sincroniza a transcrição dos dois cortes.
        await CorteService.sincronizar_transcricao_corte(corte_id)
        await CorteService.sincronizar_transcricao_corte(novo_id)

        return corte_id, novo_id

    @staticmethod
    async def proximo_corte_id(db: AsyncSession, corte_id: str) -> str | None:
        """Id do corte que começa logo depois deste, no mesmo projeto (D-575).

        Vive no serviço e não no router porque "qual é o próximo" é conhecimento
        do domínio — a ordem dos cortes é dada pelo tempo, com desempate estável
        por id. Devolve None quando este é o último. Levanta ValueError se o
        corte não existir.
        """
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado.")

        proximo = await db.execute(
            select(Corte.id)
            .where(
                Corte.projeto_id == corte.projeto_id,
                Corte.id != corte.id,
                Corte.inicio_seg >= float(corte.inicio_seg or 0.0),
            )
            .order_by(Corte.inicio_seg.asc(), Corte.id.asc())
            .limit(1)
        )
        return proximo.scalar_one_or_none()

    @staticmethod
    async def juntar_cortes(corte_id: str, outro_corte_id: str) -> str:
        """Funde dois cortes vizinhos num só (D-575) — o inverso de `dividir_corte`.

        Nasce de um caso concreto: o corte termina antes do argumento fechar e o
        corte seguinte o completa. Regerar os dois do zero jogaria fora os
        trechos a remover (que custam uma rodada de IA), as cenas, o layout e os
        shorts — por isso a junção CARREGA tudo isso em vez de recomeçar.

        Quem sobrevive é o corte que começa antes: ele mantém o `id`, e com ele
        a pasta, a URL do editor e o metadado. O outro é apagado.

        O que é feito com cada coisa:

        * **Bordas** — início do primeiro, fim do segundo.
        * **Desvios** — concatenados (são tempo absoluto da live, então nenhum
          número muda de sentido) MAIS o vão entre os dois cortes, que vira
          trecho removido. Sem esse vão, material nunca aprovado entraria de
          carona no meio do corte.
        * **Cenas, regiões do layout, segmentos detectados e shorts** — vivem em
          tempo de BRUTO, então os do segundo corte andam para a frente pela
          duração líquida do primeiro.
        * **Resumo e justificativa** — emendados; título, tema, gancho e score
          ficam os do primeiro, que é por onde o corte mesclado entra.
        * **Artefatos de vídeo** — bruto, grade, overlays e render final são
          APAGADOS: o span mudou e todos eles cobrem só a primeira metade. Ao
          contrário do `dividir`, aqui o arquivo velho não é aproveitável nem em
          parte, e deixá-lo em disco faria a UI anunciar "bruto pronto" para um
          vídeo errado.

        Retorna o id do corte sobrevivente. Levanta ValueError quando os cortes
        não existem, são o mesmo, estão em projetos diferentes, já foram
        publicados no YouTube, ou têm outro corte entre eles.
        """
        async with AsyncSessionLocal() as db:
            resultado = await db.execute(
                select(Corte)
                .options(selectinload(Corte.metadado))
                .where(Corte.id.in_([corte_id, outro_corte_id]))
            )
            por_id = {c.id: c for c in resultado.scalars().all()}

            if corte_id == outro_corte_id:
                raise ValueError("Selecione dois cortes diferentes para juntar.")
            for cid in (corte_id, outro_corte_id):
                if cid not in por_id:
                    raise ValueError("Corte não encontrado.")

            primeiro, segundo = sorted(
                por_id.values(), key=lambda c: (float(c.inicio_seg or 0.0), c.id)
            )
            await _recusar_juncao_invalida(db, primeiro, segundo)

            desvios_primeiro = _desvios_do_corte(primeiro)
            desvios_segundo = _desvios_do_corte(segundo)
            # Quanto de bruto o primeiro corte produz: é exatamente onde o
            # material do segundo passa a começar na timeline mesclada.
            offset = duracao_liquida(
                float(primeiro.inicio_seg or 0.0),
                float(primeiro.fim_seg or 0.0),
                desvios_primeiro,
            )

            primeiro.desvios = json.dumps(
                juntar_desvios(
                    desvios_primeiro,
                    desvios_segundo,
                    fim_primeiro=float(primeiro.fim_seg or 0.0),
                    inicio_segundo=float(segundo.inicio_seg or 0.0),
                ),
                ensure_ascii=False,
            )
            # D-576: a ordem escolhida em cada metade sobrevive à junção — a do
            # primeiro toca inteira, depois a do segundo. Perder isso seria o
            # mesmo tipo de estrago que a junção existe para evitar nos trechos e
            # nas cenas: trabalho editorial jogado fora por uma operação de
            # fronteira. Dois cortes sem arranjo continuam sem arranjo.
            from app.domain.arranjo_blocos import concatenar, serializar
            from app.domain.arranjo_blocos import parse as parse_arranjo

            arranjo_mesclado = concatenar(
                parse_arranjo(primeiro.arranjo_blocos),
                parse_arranjo(segundo.arranjo_blocos),
                float(primeiro.inicio_seg or 0.0),
                float(primeiro.fim_seg or 0.0),
                float(segundo.inicio_seg or 0.0),
                float(segundo.fim_seg or 0.0),
            )
            primeiro.arranjo_blocos = json.dumps(serializar(arranjo_mesclado), ensure_ascii=False)

            primeiro.fim_seg = float(segundo.fim_seg or 0.0)
            primeiro.fim_hms = segundo.fim_hms

            _juntar_marcacoes_de_bruto(primeiro, segundo, offset)
            _juntar_texto_editorial(primeiro, segundo)
            await _adotar_filhos_do_corte(db, primeiro, segundo, offset)

            # O corte mesclado volta a ser matéria-prima: os artefatos que
            # provavam "pronto" acabaram de ser invalidados pelo novo span.
            primeiro.arquivo_clip_path = ""
            primeiro.duracao_clip_seg = 0.0
            primeiro.cenas_validadas = 0
            primeiro.cenas_validadas_em = None

            projeto_id = primeiro.projeto_id
            sobrevivente_id = primeiro.id
            absorvido_id = segundo.id
            await db.delete(segundo)
            await db.commit()

            await CorteService.renumerar_por_tempo(db, projeto_id)

        # D-645: as duas apagam pastas de vídeo — rodam fora do event loop.
        await asyncio.to_thread(_apagar_pasta_do_corte, projeto_id, absorvido_id)
        await asyncio.to_thread(_apagar_artefatos_de_video, projeto_id, sobrevivente_id)

        await CorteService.sincronizar_transcricao_corte(sobrevivente_id)
        return sobrevivente_id

    @staticmethod
    async def criar_manual(
        db: AsyncSession,
        projeto_id: str,
        inicio_hms: str,
        fim_hms: str,
        titulo_proposto: str | None = None,
    ) -> Corte:
        """Cria um corte manual em [inicio_hms, fim_hms] na posição cronológica (F-056).

        Migrado do router em D-078 — comportamento preservado. Insere o corte na
        posição cronológica certa (conta quantos já começam antes) e empurra os
        posteriores (+1, de trás para frente, evitando choque transitório caso
        surja UNIQUE(projeto_id, numero)). Sincroniza a transcrição em seguida
        (best-effort, fora da transação). Devolve o corte recarregado com o
        metadado para o `_corte_to_dict`.

        Levanta `ValueError("Projeto não encontrado")` (→404 no router) ou
        `ValueError(<motivo>)` para intervalo inválido (→400).
        """
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            raise ValueError("Projeto não encontrado")

        inicio_seg = to_seg(inicio_hms)
        fim_seg = to_seg(fim_hms)
        if fim_seg <= inicio_seg:
            raise ValueError("Fim deve ser maior que o início")

        duracao_projeto = float(projeto.duracao_segundos or 0)
        if duracao_projeto > 0 and fim_seg > duracao_projeto + 1.0:
            raise ValueError(f"Fim ({fim_hms}) excede a duração do vídeo do projeto")

        existentes_result = await db.execute(
            select(Corte).where(Corte.projeto_id == projeto_id).order_by(Corte.numero)
        )
        existentes = list(existentes_result.scalars().all())

        posteriores = [c for c in existentes if float(c.inicio_seg or 0) > inicio_seg]
        posicao = len(existentes) - len(posteriores) + 1

        titulo = (titulo_proposto or "").strip() or f"Corte manual #{posicao}"

        novo_corte = Corte(
            id=str(uuid.uuid4()),
            projeto_id=projeto_id,
            numero=posicao,
            titulo_proposto=titulo,
            resumo="",
            tema_central="",
            inicio_hms=inicio_hms,
            fim_hms=fim_hms,
            inicio_seg=inicio_seg,
            fim_seg=fim_seg,
            desvios="[]",
            status=StatusCorte.PROPOSTO,
        )
        db.add(novo_corte)
        await db.commit()
        # D-448: o `numero` acima é provisório — a ordem canônica (e o empurrão
        # nos cortes posteriores) sai da renumeração cronológica.
        await CorteService.renumerar_por_tempo(db, projeto_id)
        await db.refresh(novo_corte)

        try:
            await CorteService.sincronizar_transcricao_corte(novo_corte.id)
        except Exception as e:
            logger.warning("[criar_manual] Falha ao sincronizar transcricao: %s", e)

        result = await db.execute(
            select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == novo_corte.id)
        )
        return result.scalar_one()

    @staticmethod
    async def reordenar(db: AsyncSession, projeto_id: str, cortes_ids: list[str]) -> list[Corte]:
        """Aplica a ordem informada pelo editor, FIXANDO quem saiu do tempo (D-448).

        Herdeira do F-057 (setas ↑↓ / arrastar): continua aceitando exatamente os
        ids existentes e devolvendo a lista na nova ordem. O que mudou é que a
        ordem manual deixou de ser um `numero` solto e passou a ser um PIN
        explícito (`posicao_fixada`): fica fixado só quem realmente divergiu da
        ordem cronológica, e quem voltou a coincidir com o tempo tem o pin limpo
        e volta ao padrão. Assim mover um corte na mão não congela a lista
        inteira — o resto continua se reorganizando pelo tempo.

        Levanta `ValueError("Projeto não encontrado")` (→404) ou
        `ValueError(<motivo>)` quando o conjunto de ids não bate (→400).
        """
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            raise ValueError("Projeto não encontrado")

        result = await db.execute(
            select(Corte)
            .options(selectinload(Corte.metadado))
            .where(Corte.projeto_id == projeto_id)
        )
        cortes_existentes = list(result.scalars().all())

        ids_existentes = {c.id for c in cortes_existentes}
        ids_recebidos = list(cortes_ids)

        if set(ids_recebidos) != ids_existentes or len(ids_recebidos) != len(ids_existentes):
            raise ValueError(
                "Lista de ids precisa conter exatamente os cortes do projeto, sem repeticoes."
            )

        corte_por_id = {c.id: c for c in cortes_existentes}
        pins = pins_para_ordem(
            [_ordenavel(c) for c in cortes_existentes],
            ids_recebidos,
        )
        for corte_id, pin in pins.items():
            corte_por_id[corte_id].posicao_fixada = pin

        return await CorteService.renumerar_por_tempo(db, projeto_id)

    @staticmethod
    async def renumerar_por_tempo(db: AsyncSession, projeto_id: str) -> list[Corte]:
        """Recalcula `numero` a partir da ordem canônica do projeto (D-448).

        Chamada depois de toda operação que cria ou move corte — é ela que
        mantém a promessa "a lista segue a live". Renumera em duas passadas
        (offset alto, depois os números finais) para evitar choque transitório
        entre cortes que trocam de número ao mesmo tempo. Devolve a lista já
        ordenada, com o metadado carregado.

        Commita: as chamadas vêm de handlers que já fecharam sua própria
        transação, e o número é dado derivado — não faz sentido deixá-lo
        pendurado esperando um commit alheio.
        """
        result = await db.execute(
            select(Corte)
            .options(selectinload(Corte.metadado))
            .where(Corte.projeto_id == projeto_id)
        )
        cortes = list(result.scalars().all())
        if not cortes:
            return []

        ordem = ordenar_por_tempo([_ordenavel(c) for c in cortes])
        corte_por_id = {c.id: c for c in cortes}

        offset = max((c.numero or 0 for c in cortes), default=0) + 1
        for c in cortes:
            c.numero = (c.numero or 0) + offset
        await db.flush()

        for indice, corte_id in enumerate(ordem, start=1):
            corte_por_id[corte_id].numero = indice

        await db.commit()
        return [corte_por_id[corte_id] for corte_id in ordem]

    @staticmethod
    async def normalizar_ordem(db: AsyncSession, projeto_id: str) -> list[Corte]:
        """Solta todos os pins do projeto e devolve a lista à ordem do tempo (D-448).

        O desfazer do gesto manual: com nenhum corte fixado, a ordem volta a ser
        inteiramente derivada de `inicio_seg`.
        """
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            raise ValueError("Projeto não encontrado")

        result = await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))
        for corte in result.scalars().all():
            corte.posicao_fixada = None

        return await CorteService.renumerar_por_tempo(db, projeto_id)

    @staticmethod
    async def fixar_posicao(db: AsyncSession, corte_id: str, posicao: int | None) -> list[Corte]:
        """Fixa (ou solta, com `posicao=None`) UM corte numa posição da lista (D-448).

        Levanta `ValueError("Corte não encontrado")` (→404) ou
        `ValueError(<motivo>)` quando a posição está fora da lista (→400).
        """
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado")

        if posicao is not None:
            total = await db.scalar(
                select(func.count()).select_from(Corte).where(Corte.projeto_id == corte.projeto_id)
            )
            if posicao < 1 or posicao > int(total or 0):
                raise ValueError(f"Posição precisa estar entre 1 e {int(total or 0)}.")

        corte.posicao_fixada = posicao
        return await CorteService.renumerar_por_tempo(db, corte.projeto_id)

    @staticmethod
    async def criar_corte_do_desvio(
        db: AsyncSession, corte_id: str, desvio_index: int, titulo: str = ""
    ) -> Corte:
        """Cria um novo Corte a partir de um desvio e o remove do corte original.

        Migrado do router em D-078. O novo corte herda o intervalo do desvio e
        entra na posição CRONOLÓGICA correspondente (D-448); o desvio é removido
        da lista do corte de origem.

        Levanta `ValueError("Corte não encontrado")` (→404) ou
        `ValueError("Índice de desvio inválido")` (→400).
        """
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado")

        desvios = json.loads(corte.desvios or "[]")
        if desvio_index < 0 or desvio_index >= len(desvios):
            raise ValueError("Índice de desvio inválido")

        desvio = desvios[desvio_index]

        result = await db.execute(
            select(Corte).where(Corte.projeto_id == corte.projeto_id).order_by(Corte.numero.desc())
        )
        ultimo = result.scalars().first()
        proximo_numero = (ultimo.numero + 1) if ultimo else 1

        titulo = titulo or f"[Desvio #{corte.numero}] {desvio.get('motivo', '')[:60]}"

        novo_corte = Corte(
            id=str(uuid.uuid4()),
            projeto_id=corte.projeto_id,
            numero=proximo_numero,
            titulo_proposto=titulo,
            resumo=f"Criado a partir do desvio do Corte #{corte.numero}: {desvio.get('motivo', '')}",
            tema_central="",
            inicio_hms=desvio.get("inicio_hms", "00:00:00"),
            fim_hms=desvio.get("fim_hms", "00:00:00"),
            inicio_seg=to_seg(desvio.get("inicio_hms", "00:00:00")),
            fim_seg=to_seg(desvio.get("fim_hms", "00:00:00")),
            desvios="[]",
        )
        db.add(novo_corte)

        desvios.pop(desvio_index)
        corte.desvios = json.dumps(desvios, ensure_ascii=False)

        await db.commit()
        # D-448: era aqui que a lista desandava — o corte do desvio nascia com
        # `max(numero) + 1` e ia para o fim, mesmo começando no meio da live.
        await CorteService.renumerar_por_tempo(db, corte.projeto_id)
        await db.refresh(novo_corte)
        return novo_corte

    @staticmethod
    async def adicionar_desvio(
        db: AsyncSession, corte_id: str, inicio_hms: str, fim_hms: str, motivo: str = ""
    ) -> Corte:
        """Adiciona um desvio criado manualmente ao corte, ordenado por início.

        Migrado do router em D-078 — comportamento preservado. Insere o desvio
        com origem `manual` e reordena a lista por `inicio_seg`.

        Levanta `ValueError("Corte não encontrado")` (→404).
        """
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado")

        desvios = json.loads(corte.desvios or "[]")

        novo_desvio = {
            "inicio_hms": inicio_hms,
            "fim_hms": fim_hms,
            "inicio_seg": to_seg(inicio_hms),
            "fim_seg": to_seg(fim_hms),
            "motivo": motivo or "Desvio manual",
            "origem": "manual",
        }

        desvios.append(novo_desvio)
        desvios.sort(key=lambda d: d.get("inicio_seg", 0))

        corte.desvios = json.dumps(desvios, ensure_ascii=False)
        await db.commit()
        await db.refresh(corte)
        return corte

    @staticmethod
    async def remover_desvio(db: AsyncSession, corte_id: str, desvio_index: int) -> Corte:
        """Remove um desvio do corte pelo índice, sem criar novo corte.

        Migrado do router em D-078 — comportamento preservado.

        Levanta `ValueError("Corte não encontrado")` (→404) ou
        `ValueError("Índice de desvio inválido")` (→400).
        """
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado")

        desvios = json.loads(corte.desvios or "[]")
        if desvio_index < 0 or desvio_index >= len(desvios):
            raise ValueError("Índice de desvio inválido")

        desvios.pop(desvio_index)
        corte.desvios = json.dumps(desvios, ensure_ascii=False)
        await db.commit()
        await db.refresh(corte)
        return corte

    @staticmethod
    async def detectar_silencios_tecnico(corte_id: str, limpar_anteriores: bool = False) -> dict:
        """
        Usa o FFmpeg silencedetect para encontrar silêncios reais no trecho do vídeo.
        """
        import re

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            projeto = await db.get(Projeto, corte.projeto_id)

            from app.channel_paths import resolver_do_projeto

            # Re-ancora o caminho no canal ATIVO (D-172): tolera path stale no banco.
            video_path = str(resolver_do_projeto(projeto.arquivo_video_path, projeto.id))

            from pathlib import Path

            from app.services.media_proxy import MediaProxyService

            # Sincroniza parâmetros de janela com MediaProxyService.gerar_audio_proxy
            # (D-451: a janela é configurável, então lê do mesmo acessor — um
            # número divergente aqui deslocaria TODOS os silêncios detectados).
            contexto_antes_seg, _ = MediaProxyService.contexto_seg()
            p_start_proxy = max(0, float(corte.inicio_seg) - contexto_antes_seg)
            proxy_path = Path(await MediaProxyService.gerar_audio_proxy(corte_id, db, force=False))
            proxy_start_offset = p_start_proxy

            if proxy_path.exists():
                cmd = build_silence_detect_proxy_cmd(proxy_path)
                use_proxy = True
                operational_debug(
                    "CorteService", f"Detectando silêncios via proxy FLAC: {proxy_path}"
                )
            else:
                # Fallback: vídeo original (mais lento mas igualmente preciso com busca correta)
                duration = float(corte.fim_seg) - float(corte.inicio_seg)
                cmd = build_silence_detect_video_cmd(video_path, corte.inicio_seg, duration)
                use_proxy = False
                operational_debug(
                    "CorteService",
                    f"Proxy FLAC inexistente, detectando direto no vídeo: {video_path}",
                )

            from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

            try:
                res = await run_ffmpeg_simple(cmd, label="detectar_silencios", capture_output=True)
                output = res.stderr
                returncode = res.returncode
            except Exception as e:
                operational_error("CorteService", f"Erro na detecção de silêncios: {e}")
                return {"status": "erro", "erro": str(e)}

            if returncode != 0 and "silencedetect" not in output:
                operational_error(
                    "CorteService", f"FFmpeg falhou (code {returncode}): {output[-500:]}"
                )
                return {"status": "erro", "erro": "FFmpeg falhou na detecção de silêncios"}

            starts = re.findall(r"silence_start: ([\d\.]+)", output)
            ends = re.findall(r"silence_end: ([\d\.]+)", output)

            novos_desvios = []
            for s, e in zip(starts, ends, strict=False):
                s_val = float(s)
                e_val = float(e)

                if s_val < 0:
                    continue

                # FLAC não tem priming -> s_val é tempo exato dentro do proxy.
                # Soma proxy_start_offset (= inicio_seg - 60) para tempo absoluto.
                # Margens (+0.1s / -0.1s) deixam buffer para não cortar fala.
                if use_proxy:
                    s_abs = s_val + proxy_start_offset + 0.1
                    e_abs = e_val + proxy_start_offset - 0.1
                else:
                    s_abs = s_val + float(corte.inicio_seg) + 0.1
                    e_abs = e_val + float(corte.inicio_seg) - 0.1

                # Clipa dentro dos limites exatos do corte
                s_abs = max(round(s_abs, 3), float(corte.inicio_seg))
                e_abs = min(round(e_abs, 3), float(corte.fim_seg))

                # Descarta blocos menores que 0.6s após ajuste (apenas pausas mais longas)
                if e_abs - s_abs < 0.6:
                    continue

                # seg_to_hms preserva milissegundos (HH:MM:SS.mmm) para evitar
                # perda de precisão ao recarregar os desvios do banco.
                novos_desvios.append(
                    {
                        "inicio_hms": seg_to_hms(s_abs),
                        "fim_hms": seg_to_hms(e_abs),
                        "inicio_seg": s_abs,
                        "fim_seg": e_abs,
                        "motivo": "Silêncio Detectado (IA/Técnico)",
                        "origem": "tecnico",
                        # D-422: categoria explícita — o badge do painel não precisa
                        # inferir "silêncio" do texto do motivo.
                        "categoria": SILENCIO,
                    }
                )

            if limpar_anteriores:
                desvios_atuais = [
                    normalizar_desvio(d)
                    for d in json.loads(corte.desvios or "[]")
                    if d.get("motivo") != "Silêncio Detectado (IA/Técnico)"
                ]
            else:
                desvios_atuais = [normalizar_desvio(d) for d in json.loads(corte.desvios or "[]")]

            # Deduplicação por proximidade de tempo (tolerância 0.5s) em vez de string
            # HMS, que tinha precisão de apenas 1 segundo e gerava duplicatas falsas.
            def _ja_existe(nd: dict, existentes: list) -> bool:
                nd_inicio = float(nd.get("inicio_seg", 0))
                return any(abs(float(d.get("inicio_seg", 0)) - nd_inicio) < 0.5 for d in existentes)

            for nd in novos_desvios:
                if not _ja_existe(nd, desvios_atuais):
                    desvios_atuais.append(nd)

            desvios_atuais.sort(key=lambda x: float(x.get("inicio_seg", 0)))
            corte.desvios = json.dumps(desvios_atuais, ensure_ascii=False)
            await db.commit()

        # Recalcula a transcrição
        try:
            await CorteService.sincronizar_transcricao_corte(corte_id, db=db)
        except Exception as e:
            operational_error(
                "CorteService",
                f"Erro ao sincronizar transcrição após silêncios: {e}\n{traceback.format_exc()}",
            )

        return {"status": "sucesso", "desvios": desvios_atuais}

    @staticmethod
    async def sincronizar_transcricao_corte(corte_id: str, db: AsyncSession = None):
        """
        Gera/Atualiza a transcrição específica de um corte baseada na transcrição bruta do projeto.
        Faz 3 coisas:
        1. transcricao_corte: Bruta — todas as falas no intervalo [inicio-60s, fim+60s].
        2. transcricao_final: Editada — apenas falas que ficaram após remover desvios, com tempos re-mapeados.
        3. transcricao_final_texto: Texto puro limpo para a IA de metadados.
        """

        if db is None:
            async with AsyncSessionLocal() as session:
                await CorteService._exec_sincronia(corte_id, session)
        else:
            await CorteService._exec_sincronia(corte_id, db)

    @staticmethod
    async def sincronizar_transcricao_do_projeto(projeto_id: str, db: AsyncSession) -> int:
        """Ressincroniza TODOS os cortes do projeto lendo a transcrição uma vez (D-652).

        Antes era corte a corte, e cada passada recarregava o projeto e fazia o
        `json.loads` da transcrição INTEIRA da live. Numa live longa com 30
        cortes, era a mesma transcrição gigante lida e parseada 30 vezes — o
        trabalho crescia com o quadrado do tamanho do projeto.

        Devolve quantos cortes foram sincronizados.
        """
        projeto = await db.get(Projeto, projeto_id)
        if not projeto or not projeto.transcricao_raw:
            return 0

        trans_raw = json.loads(projeto.transcricao_raw or "[]")
        cortes = (
            (await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))).scalars().all()
        )
        for corte in cortes:
            await CorteService._exec_sincronia(corte.id, db, trans_raw=trans_raw)
        return len(cortes)

    @staticmethod
    async def _exec_sincronia(corte_id: str, db: AsyncSession, *, trans_raw: list | None = None):
        from app.services.timeline_math import TimelineMath

        try:
            corte = await db.get(Corte, corte_id)
            if not corte:
                operational_error(
                    "CorteService",
                    f"sincronizar_transcricao_corte: Corte {corte_id} não encontrado.",
                )
                return

            # Recarrega do banco para garantir que desvios recém-salvos apareçam (SQLite)
            await db.refresh(corte)

            if trans_raw is None:
                projeto = await db.get(Projeto, corte.projeto_id)
                if not projeto or not projeto.transcricao_raw:
                    return
                trans_raw = json.loads(projeto.transcricao_raw or "[]")

            from app.domain.segment_calculator import normalizar_desvio

            desvios = [normalizar_desvio(d) for d in json.loads(corte.desvios or "[]")]

            operational_debug(
                "CorteService", f"Sincronizando '{corte.titulo_proposto}' ({corte_id})"
            )
            operational_debug("CorteService", f"  Range: {corte.inicio_seg} -> {corte.fim_seg}")
            operational_debug("CorteService", f"  Desvios no banco ({len(desvios)}):")
            for d in desvios:
                operational_debug(
                    "CorteService",
                    f"    - [{d.get('inicio_seg')} -> {d.get('fim_seg')}] {d.get('motivo')}",
                )

            # ── 1. Transcrição Bruta (trecho completo + buffer de 60s) ──
            def _to_seg(val) -> float:
                if isinstance(val, (int, float)):
                    return float(val)
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return hms_to_seg(str(val))

            c_inicio = _to_seg(corte.inicio_seg or 0.0)
            c_fim = _to_seg(corte.fim_seg or 0.0)

            inicio_seg_buffer = max(0, c_inicio - 60)
            fim_seg_buffer = c_fim + 60

            trans_bruta = []
            for item in trans_raw:
                try:
                    t_start = _to_seg(item.get("start", item.get("inicio", 0)))

                    if inicio_seg_buffer <= t_start <= fim_seg_buffer:
                        t_end = _to_seg(item.get("end", item.get("fim", t_start + 1)))

                        seg_bruto = {
                            "start": t_start,
                            "end": t_end,
                            "texto": item.get("texto", ""),
                        }
                        # D-309: preserva o rótulo de falante da diarização
                        # (speaker) fim-a-fim. `limpar_e_ordenar_transcricao` e
                        # `TimelineMath.recalcular_transcricao` já o propagam, então
                        # a transcrição final passa a carregar o falante por
                        # segmento — dispensando a reprojeção de timeline que a
                        # geração de cenas (D-307) precisava fazer.
                        if item.get("speaker"):
                            seg_bruto["speaker"] = item["speaker"]
                        # O timing por palavra (D-337) vem do json3 e sobrevive à
                        # limpeza, que já o preserva — mas morria AQUI, porque
                        # este dicionário era montado à mão sem ele. Sem essa
                        # linha o corte perde a granularidade que a live tem, e
                        # qualquer recurso por palavra (âncora de citação,
                        # detecção de hesitação) fica sem base no nível do corte.
                        # Os tempos são absolutos, como `start`/`end` aqui.
                        if item.get("palavras"):
                            seg_bruto["palavras"] = item["palavras"]
                        trans_bruta.append(seg_bruto)
                except Exception:
                    continue

            from app.domain.transcricao_utils import limpar_e_ordenar_transcricao

            trans_bruta = limpar_e_ordenar_transcricao(trans_bruta)

            # ── 2. Transcrição Final (editada, sem desvios, tempos re-mapeados) ──
            def _d_val(d: dict, k_seg: str, k_hms: str) -> float:
                val_seg = d.get(k_seg)
                if val_seg is not None:
                    return _to_seg(val_seg)
                return hms_to_seg(d.get(k_hms, ""))

            # ── 2. Calcular Segmentos Mantidos (Lógica unificada com ExportService) ──
            # D-576: na ORDEM DE EXIBIÇÃO, não na cronológica. Se o corte tem
            # arranjo de blocos, a transcrição final precisa nascer embaralhada
            # do mesmo jeito que o vídeo — senão a legenda descreve um bruto que
            # não existe mais, e as cenas (que leem daqui) apontam para o lugar
            # errado. Sem arranjo, é o mesmo `calcular_segmentos` de sempre.
            from app.domain.arranjo_blocos import parse as parse_arranjo
            from app.domain.arranjo_blocos import reconciliar, segmentos_na_ordem

            arranjo = reconciliar(parse_arranjo(corte.arranjo_blocos), c_inicio, c_fim)
            segmentos_mantidos = segmentos_na_ordem(arranjo, c_inicio, c_fim, desvios)
            operational_debug("CorteService", f"  Segmentos mantidos ({len(segmentos_mantidos)}):")
            for sm in segmentos_mantidos:
                operational_debug(
                    "CorteService",
                    f"    - [{sm['start']} -> {sm['end']}] dur={round(sm['end'] - sm['start'], 2)}s",
                )

            # Log de debug para auditoria de drift
            dur_est = sum(s["end"] - s["start"] for s in segmentos_mantidos)
            operational_debug(
                "CorteService", f"Sincronia: {len(segmentos_mantidos)} segs, dur={dur_est:.2f}s"
            )

            nova_trans = TimelineMath.recalcular_transcricao(trans_bruta, segmentos_mantidos)

            # ── 3. Texto puro limpo para IA ──
            texto_final = " ".join(
                [str(item.get("texto", "")).strip() for item in nova_trans if item.get("texto")]
            )

            # Log de debug para verificar sincronia
            if nova_trans:
                operational_debug(
                    "CorteService",
                    f"Sincronia concluída para '{corte.titulo_proposto}'. "
                    f"Primeiro timestamp: {nova_trans[0].get('start')}s",
                )

            corte.transcricao_corte = json.dumps(trans_bruta, ensure_ascii=False)
            corte.transcricao_final = json.dumps(nova_trans, ensure_ascii=False)
            corte.transcricao_final_texto = texto_final

            # Retry para "database is locked" em picos de escrita. D-652: sem o
            # `rollback`, a sessão fica suja depois da falha e as 4 tentativas
            # seguintes morrem em PendingRollbackError — o retry era inócuo e
            # mascarava o erro real.
            for attempt in range(5):
                try:
                    await db.commit()
                    break
                except Exception as e:
                    if "locked" in str(e).lower() and attempt < 4:
                        import asyncio

                        await db.rollback()
                        await asyncio.sleep(0.5 * (attempt + 1))
                        continue
                    raise e
        except Exception as e:
            operational_error(
                "CorteService",
                f"Erro CRÍTICO em sincronizar_transcricao_corte({corte_id}): "
                f"{e}\n{traceback.format_exc()}",
            )
            raise
