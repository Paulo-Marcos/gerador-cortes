"""
Serviço de Cortes — integrações pós-análise via IA e utilitários
"""

import json
import logging
import traceback
import uuid
from dataclasses import dataclass

from app.database import AsyncSessionLocal
from app.domain.corte_mapper import (
    extrair_cenas_remotion,
    normalizar_cenas_remotion_payload,
    tem_colapso_de_tempos_das_cenas,
)
from app.domain.reading_metadata import (
    aplicar_emojis_texto_capa,
    aplicar_prefixo_leitura_titulo,
    remover_prefixo_leitura_titulo,
)
from app.domain.segment_calculator import dividir_desvios_no_ponto, normalizar_desvio
from app.domain.time_convert import hms_to_seg, seg_to_hms, to_seg
from app.domain.youtube_layout import normalizar_layout_youtube
from app.models import Corte, Projeto, StatusCorte
from app.services.app_logging import operational_debug, operational_error
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

# Margem mínima (s) que cada metade precisa ter para a divisão ser válida —
# evita criar cortes degenerados quando o ponteiro fica colado na borda.
_MARGEM_DIVISAO_SEG = 0.5


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

        await db.refresh(corte)
        return corte

    @staticmethod
    async def analisar_desvios_todos_impl(projeto_id: str):
        import asyncio

        from app.database import AsyncSessionLocal
        from app.models import Corte
        from app.services.claude_ia import ClaudeIaService
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))
            todos = result.scalars().all()
            corte_ids = [c.id for c in todos]

        for cid in corte_ids:
            try:
                await ClaudeIaService.gerar_trechos_via_claude(cid)
                await asyncio.sleep(1)
            except Exception as e:
                operational_error("AnalisarDesvios", f"Erro no corte {cid}: {e}")

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

            # Abre espaço: empurra +1 todos os cortes posteriores ao original.
            # Ordena desc pra evitar choque transitório caso algum dia exista
            # UNIQUE(projeto_id, numero).
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == corte.projeto_id, Corte.numero > corte.numero)
                .order_by(Corte.numero.desc())
            )
            for posterior in result.scalars().all():
                posterior.numero = posterior.numero + 1
            await db.flush()

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

            await db.commit()

        # Fora do bloco de escrita: re-sincroniza a transcrição dos dois cortes.
        await CorteService.sincronizar_transcricao_corte(corte_id)
        await CorteService.sincronizar_transcricao_corte(novo_id)

        return corte_id, novo_id

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

        # Renumera de trás para frente para evitar choque transitório caso algum
        # dia surja UNIQUE (projeto_id, numero).
        for c in sorted(posteriores, key=lambda x: x.numero, reverse=True):
            c.numero = c.numero + 1

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
        """Renumera os cortes do projeto seguindo a ordem informada (F-057).

        Migrado do router em D-078 — comportamento preservado. `cortes_ids`
        precisa conter exatamente os ids existentes (mesmo conjunto, sem
        repetições). A renumeração roda em duas passadas (todos para um offset
        alto, depois os números finais) para evitar choque transitório entre
        cortes renumerados ao mesmo tempo. Devolve a lista já na nova ordem,
        com o metadado carregado.

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

        # Duas passadas para evitar choque transitório de numero entre cortes
        # renumerados ao mesmo tempo: offset alto primeiro, números finais depois.
        offset = max((c.numero for c in cortes_existentes), default=0) + 1
        for c in cortes_existentes:
            c.numero = c.numero + offset
        await db.flush()

        for indice, corte_id in enumerate(ids_recebidos, start=1):
            corte_por_id[corte_id].numero = indice

        await db.commit()

        result_final = await db.execute(
            select(Corte)
            .options(selectinload(Corte.metadado))
            .where(Corte.projeto_id == projeto_id)
            .order_by(Corte.numero)
        )
        return list(result_final.scalars().all())

    @staticmethod
    async def criar_corte_do_desvio(
        db: AsyncSession, corte_id: str, desvio_index: int, titulo: str = ""
    ) -> Corte:
        """Cria um novo Corte a partir de um desvio e o remove do corte original.

        Migrado do router em D-078 — comportamento preservado. O novo corte
        entra ao final (maior numero + 1) e herda o intervalo do desvio; o
        desvio é removido da lista do corte de origem.

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
    async def gerar_resumo_ia(corte_id: str) -> dict:
        """Regera o resumo do corte via Claude (filtra a sub-transcrição do
        período e pede um resumo maduro). Delega ao caminho Claude e mantém o
        contrato `{resumo, status}` que o router de cortes consome.
        """
        # Import local: claude_ia importa serviços de domínio no topo (evita ciclo).
        from app.services.claude_ia import ClaudeIaService

        return await ClaudeIaService.gerar_resumo_via_claude(corte_id)

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
            p_start_proxy = max(0, float(corte.inicio_seg) - MediaProxyService.PROXY_PRE_SEC)
            proxy_path = Path(await MediaProxyService.gerar_audio_proxy(corte_id, db, force=False))
            proxy_start_offset = p_start_proxy

            if proxy_path.exists():
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(proxy_path),
                    "-af",
                    "silencedetect=noise=-40dB:d=0.6",
                    "-f",
                    "null",
                    "-",
                ]
                use_proxy = True
                operational_debug("CorteService", f"Detectando silêncios via proxy FLAC: {proxy_path}")
            else:
                # Fallback: vídeo original (mais lento mas igualmente preciso com busca correta)
                duration = float(corte.fim_seg) - float(corte.inicio_seg)
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-i",
                    video_path,
                    "-ss",
                    str(corte.inicio_seg),
                    "-t",
                    str(duration),
                    "-vn",
                    "-af",
                    "highpass=f=80,silencedetect=noise=-40dB:d=0.3",
                    "-f",
                    "null",
                    "-",
                ]
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
                operational_error("CorteService", f"FFmpeg falhou (code {returncode}): {output[-500:]}")
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
    async def _exec_sincronia(corte_id: str, db: AsyncSession):
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

            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto or not projeto.transcricao_raw:
                return

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

            trans_raw = json.loads(projeto.transcricao_raw or "[]")

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

                        trans_bruta.append(
                            {"start": t_start, "end": t_end, "texto": item.get("texto", "")}
                        )
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
            from app.domain.segment_calculator import calcular_segmentos

            segmentos_mantidos = calcular_segmentos(c_inicio, c_fim, desvios)
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

            # Retry loop para evitar "database is locked" em picos de escrita
            for attempt in range(5):
                try:
                    await db.commit()
                    break
                except Exception as e:
                    if "locked" in str(e).lower() and attempt < 4:
                        import asyncio

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
