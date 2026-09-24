"""
Serviço de Análise — gera cortes via Claude e os salva no projeto
"""

import json
import logging
import uuid
from datetime import datetime

from app.database import AsyncSessionLocal
from app.domain.ancora_match import achatar_palavras, ancorar_intervalo
from app.domain.manual_prompt import pedir_resposta_json_em_bloco_codigo
from app.domain.projeto.analise_aditiva import bucket_de_30s, mesclar_descartados
from app.domain.projeto.diarizacao_align import mapa_falantes_para_meta
from app.domain.projeto.transcricao_utils import motivo_transcricao_inutilizavel
from app.domain.segment_calculator import normalizar_desvio as _normalizar_desvio
from app.domain.time_convert import hms_to_seg, seg_to_hms, to_seg_estrito
from app.models import Corte, CorteSnapshot, Projeto, StatusProjeto
from app.provider_ia import ProviderIA
from app.services.app_logging import operational_info
from app.services.ciclo_de_vida import mudar_projeto
from app.services.claude_ia import (
    ClaudeIaService,
    _carregar_transcricao_raw,
)
from sqlalchemy import select as sa_select

# D-355: janela (em segundos) para ancorar a borda de CORTE na palavra citada.
# Ampla porque o timestamp do LLM é "de memória" e erra por dezenas de segundos;
# a busca janelada ainda evita casar frase repetida em outro ponto da live.
_JANELA_ANCORA_CORTE_SEG = 60.0

# A mensagem cabe num toast; o texto integral do descarte fica na auditoria.
_LIMITE_MOTIVO_NA_TELA = 400

logger = logging.getLogger(__name__)


def _bordas_ancoradas_do_corte(
    corte_data: dict, inicio_seg: float, fim_seg: float, palavras: list[dict]
) -> tuple[float, float]:
    """D-355: ancora as bordas do corte no tempo real da palavra quando o LLM
    fornece a citação (`inicio_texto`/`fim_texto`).

    Piloto: se `inicio_texto` faltar, usa a `frase_gancho.texto` como âncora de
    início (a skill v2 já produz o gancho verbatim). Sem citação, sem palavras
    (VTT legado) ou sem bom match → devolve o par proposto intacto (não-quebradiço).
    """
    inicio_texto = (corte_data.get("inicio_texto") or "").strip()
    fim_texto = (corte_data.get("fim_texto") or "").strip()
    if not inicio_texto:
        gancho = corte_data.get("frase_gancho")
        if isinstance(gancho, dict):
            inicio_texto = (gancho.get("texto") or "").strip()
    if not palavras or (not inicio_texto and not fim_texto):
        return inicio_seg, fim_seg
    return ancorar_intervalo(
        inicio_texto,
        fim_texto,
        inicio_seg,
        fim_seg,
        palavras,
        janela_seg=_JANELA_ANCORA_CORTE_SEG,
    )


def _snapshot_da_proposta(corte: Corte, origem: str) -> CorteSnapshot:
    """D-303: congela a proposta da IA no instante em que o corte nasce.

    Copia os campos do Corte recém-construído (ainda sem edição humana);
    o snapshot nunca é atualizado depois — é a régua proposta×final da
    telemetria editorial. Coalesce com defaults porque atributos não setados
    de um ORM ainda não flushado valem None (ex.: justificativa na análise
    de intervalo).
    """
    return CorteSnapshot(
        id=str(uuid.uuid4()),
        corte_id=corte.id,
        numero=corte.numero or 0,
        titulo_proposto=corte.titulo_proposto or "",
        tema_central=corte.tema_central or "",
        resumo=corte.resumo or "",
        justificativa=corte.justificativa or "",
        inicio_hms=corte.inicio_hms or "00:00:00",
        fim_hms=corte.fim_hms or "00:00:00",
        inicio_seg=corte.inicio_seg or 0.0,
        fim_seg=corte.fim_seg or 0.0,
        desvios=corte.desvios or "[]",
        frase_gancho_hms=corte.frase_gancho_hms or "",
        frase_gancho_texto=corte.frase_gancho_texto or "",
        contextualizacao=corte.contextualizacao or "",
        score_json=corte.score_json or "{}",
        origem_analise=origem,
    )


def _campos_v2_da_proposta(corte_data: dict) -> dict:
    """D-302: extrai os campos da proposta v2 (frase_gancho, contextualizacao,
    score) com tolerância total à ausência — skills anteriores à v2 seguem
    importando normalmente, com os campos vazios.
    """
    gancho = corte_data.get("frase_gancho")
    if not isinstance(gancho, dict):
        gancho = {}
    score = corte_data.get("score")
    return {
        "frase_gancho_hms": str(gancho.get("hms") or "").strip(),
        "frase_gancho_texto": str(gancho.get("texto") or "").strip(),
        "contextualizacao": str(corte_data.get("contextualizacao") or "").strip(),
        "score_json": json.dumps(score, ensure_ascii=False) if isinstance(score, dict) else "{}",
    }


def _com_origem_de_analise(desvio: dict, origem: str) -> dict:
    """D-302: desvio proposto pela análise interna herda o nome do PROVIDER que
    o propôs ("claude"/"gemini") — é o que o torna revisável pela 2ª passada
    (trechos-expert), o conta como IA na telemetria e deixa a tela dizer quem
    gerou. Import manual (`origem='manual'`) fica sem rótulo (o editor assume a
    proveniência ⇒ protegido de revisão), e um desvio que já traga `origem`
    própria é respeitado.
    """
    if desvio.get("origem") or origem == "manual":
        return desvio
    return {**desvio, "origem": origem}


class AnaliseService:
    @staticmethod
    async def montar_prompt(projeto_id: str) -> dict:
        """Retorna uma lista de prompts divididos em chunks para análise manual."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto or not projeto.transcricao_raw:
                raise ValueError("Projeto não encontrado ou sem transcrição")

        transcricao = json.loads(projeto.transcricao_raw)
        meta = AnaliseService._meta_do_prompt(projeto, projeto.duracao_segundos or 0)

        from app.domain.projeto.chunker import fatiar_transcricao
        from app.domain.projeto.transcricao_utils import (
            dividir_segmentos_longos,
            limpar_e_ordenar_transcricao,
        )

        # Limpa e ordena para corrigir problemas de legados ou extrações out-of-order
        transcricao_limpa = limpar_e_ordenar_transcricao(transcricao)
        transcricao_granular = dividir_segmentos_longos(
            transcricao_limpa, max_duracao=4.0, max_palavras=6
        )

        # Atribui índices globais para evitar confusão entre chunks
        for idx, seg in enumerate(transcricao_granular):
            seg["global_index"] = idx

        chunks = fatiar_transcricao(
            transcricao_granular,
            chunk_tamanho_seg=2400.0,
            overlap_seg=300.0,
            min_last_chunk_seg=1200.0,
        )

        prompts = []
        for i, chunk in enumerate(chunks):
            linhas = []
            from app.domain.time_convert import seg_to_hms_short

            for seg in chunk:
                inicio = seg.get("inicio", seg.get("start", 0))
                inicio_hms = seg_to_hms_short(to_seg_estrito(inicio))
                texto = seg.get("texto", seg.get("text", "")).strip()
                if texto:
                    idx_global = seg.get("global_index", 0)
                    linhas.append(f"[{idx_global}] ({inicio_hms}) {texto}")

            transcricao_texto = "\n".join(linhas)

            prompt_chunk = AnaliseService._prompt_manual(
                transcricao_texto,
                meta,
                cabecalho=(
                    f"ATENÇÃO: Esta é a PARTE {i + 1} de {len(chunks)} da transcrição. "
                    "Avalie e retorne os cortes apenas deste trecho."
                ),
            )

            prompts.append(
                {
                    "parte": i + 1,
                    "total_partes": len(chunks),
                    "texto": pedir_resposta_json_em_bloco_codigo(prompt_chunk),
                }
            )

        return {
            "prompts": prompts,
            "formato_esperado": {
                "cortes": [
                    {
                        "titulo_proposto": "...",
                        "resumo": "...",
                        "tema_central": "...",
                        "inicio_hms": "HH:MM:SS",
                        "fim_hms": "HH:MM:SS",
                        "inicio_seg": 0,
                        "fim_seg": 0,
                        "desvios": [],
                    }
                ]
            },
        }

    @staticmethod
    async def montar_prompt_intervalo(
        projeto_id: str,
        inicio_seg: float,
        fim_seg: float,
        blocos: int | None = None,
    ) -> dict:
        """Gera prompts particionados apenas para o intervalo especificado.

        Usa a mesma lógica de granularização e chunking do montar_prompt,
        mas filtra a transcrição para o intervalo [inicio_seg, fim_seg].
        """
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto:
                raise ValueError("Projeto não encontrado")
            if not projeto.transcricao_raw:
                raise ValueError("Projeto ainda sem transcrição")

        transcricao_completa = json.loads(projeto.transcricao_raw)

        # Filtra segmentos que caem dentro do intervalo.
        # O campo inicio/fim pode ser float OU string HH:MM:SS.mmm dependendo
        # da fonte (json3_parser retorna HH:MM:SS, dividir_segmentos retorna float).

        transcricao_intervalo = []
        for seg in transcricao_completa:
            seg_inicio = to_seg_estrito(seg.get("inicio", seg.get("start", 0)))
            seg_fim = to_seg_estrito(seg.get("fim", seg.get("end", 0)))
            if seg_fim >= inicio_seg and seg_inicio <= fim_seg:
                transcricao_intervalo.append(seg)

        if not transcricao_intervalo:
            raise ValueError(
                f"Nenhuma transcrição encontrada no intervalo {inicio_seg}s – {fim_seg}s"
            )

        from app.domain.projeto.chunker import fatiar_transcricao
        from app.domain.projeto.transcricao_utils import (
            dividir_segmentos_longos,
            limpar_e_ordenar_transcricao,
        )
        from app.domain.time_convert import seg_to_hms_short

        # Limpa e ordena para corrigir problemas de legados ou extrações out-of-order
        transcricao_limpa = limpar_e_ordenar_transcricao(transcricao_intervalo)

        trans_granular = dividir_segmentos_longos(
            transcricao_limpa,
            max_duracao=4.0,
            max_palavras=6,
        )

        for idx, seg in enumerate(trans_granular):
            seg["global_index"] = idx

        if blocos:
            chunks = AnaliseService._dividir_transcricao_em_blocos(
                trans_granular,
                inicio_seg,
                fim_seg,
                blocos,
            )
        else:
            chunks = fatiar_transcricao(
                trans_granular,
                chunk_tamanho_seg=2400.0,
                overlap_seg=300.0,
                min_last_chunk_seg=1200.0,
            )

        meta = AnaliseService._meta_do_prompt(projeto, fim_seg - inicio_seg)

        prompts = []
        for i, chunk in enumerate(chunks):
            linhas = []
            for seg in chunk:
                inicio = seg.get("inicio", seg.get("start", 0))
                inicio_hms = seg_to_hms_short(to_seg_estrito(inicio))
                texto = seg.get("texto", seg.get("text", "")).strip()
                if texto:
                    idx_global = seg.get("global_index", 0)
                    linhas.append(f"[{idx_global}] ({inicio_hms}) {texto}")

            texto_chunk = "\n".join(linhas)
            parte_inicio, parte_fim = AnaliseService._limites_chunk_intervalo(
                chunk,
                inicio_seg,
                fim_seg,
                i,
                len(chunks),
            )

            cabecalho = (
                f"ATENÇÃO: Esta é a PARTE {i + 1} de {len(chunks)} "
                f"do INTERVALO SELECIONADO do vídeo. "
                f"Intervalo desta parte: {seg_to_hms_short(parte_inicio)} ate {seg_to_hms_short(parte_fim)}. "
                f"Gere os cortes apenas para esta parte."
            )

            prompt_chunk = AnaliseService._prompt_manual(texto_chunk, meta, cabecalho=cabecalho)

            prompts.append(
                {
                    "parte": i + 1,
                    "total_partes": len(chunks),
                    "texto": pedir_resposta_json_em_bloco_codigo(prompt_chunk),
                }
            )

        return {
            "prompts": prompts,
            "formato_esperado": {
                "cortes": [
                    {
                        "titulo_proposto": "...",
                        "resumo": "...",
                        "tema_central": "...",
                        "inicio_hms": "HH:MM:SS",
                        "fim_hms": "HH:MM:SS",
                        "inicio_seg": 0,
                        "fim_seg": 0,
                        "desvios": [],
                    }
                ]
            },
        }

    @staticmethod
    def _dividir_transcricao_em_blocos(
        transcricao: list[dict],
        inicio_seg: float,
        fim_seg: float,
        blocos: int,
    ) -> list[list[dict]]:
        duracao = fim_seg - inicio_seg
        tamanho_bloco = duracao / blocos
        chunks: list[list[dict]] = []

        for indice in range(blocos):
            bloco_inicio = inicio_seg + (indice * tamanho_bloco)
            bloco_fim = fim_seg if indice == blocos - 1 else bloco_inicio + tamanho_bloco
            chunk = [
                seg
                for seg in transcricao
                if to_seg_estrito(seg.get("fim", seg.get("end", 0))) >= bloco_inicio
                and to_seg_estrito(seg.get("inicio", seg.get("start", 0))) <= bloco_fim
            ]
            chunks.append(chunk)

        return chunks

    @staticmethod
    def _limites_chunk_intervalo(
        chunk: list[dict],
        inicio_seg: float,
        fim_seg: float,
        indice: int,
        total: int,
    ) -> tuple[float, float]:
        if not chunk:
            tamanho = (fim_seg - inicio_seg) / max(total, 1)
            parte_inicio = inicio_seg + indice * tamanho
            parte_fim = fim_seg if indice == total - 1 else parte_inicio + tamanho
            return parte_inicio, parte_fim

        parte_inicio = min(
            to_seg_estrito(seg.get("inicio", seg.get("start", inicio_seg))) for seg in chunk
        )
        parte_fim = max(to_seg_estrito(seg.get("fim", seg.get("end", fim_seg))) for seg in chunk)
        return max(inicio_seg, parte_inicio), min(fim_seg, parte_fim)

    @staticmethod
    async def _palavras_word_level(db, projeto_id: str) -> list[dict]:
        """D-355: lista achatada e ordenada das palavras word-level (D-337) do
        projeto, fonte da âncora verbatim. Vazia quando o projeto não tem
        `transcricao_raw` ou ela é legado sem `palavras` (âncora vira no-op)."""
        projeto = await db.get(Projeto, projeto_id)
        raw = getattr(projeto, "transcricao_raw", None) if projeto else None
        if not isinstance(raw, str) or not raw:
            return []
        try:
            transcricao = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
        return achatar_palavras(transcricao if isinstance(transcricao, list) else [])

    @staticmethod
    async def importar_resultado(
        projeto_id: str,
        cortes_data: list,
        descartados: list | None = None,
        origem: str = "claude",
    ):
        """Salva cortes vindos de IA externa com a mesma lógica do analisar_transcricao.

        I-034: além dos cortes, persiste `descartados` (blocos NÃO_RECOMENDADOS
        que a IA decidiu não virar corte) em `projetos.descartados_analise`,
        e a `justificativa` editorial em cada corte. Ambos são audit trail.

        D-303: cada corte criado aqui ganha um `CorteSnapshot` imutável com a
        proposta original da IA. `origem` registra a proveniência da análise;
        o default é "claude" porque o único caller que não passa o parâmetro é
        o pipeline interno (ClaudeIaService) — os endpoints de import manual
        passam "manual" explicitamente.

        D-302: os campos v2 da proposta (frase_gancho, contextualizacao, score)
        são persistidos quando presentes e tolerados quando ausentes (skills
        anteriores à v2). Desvios de análise `origem="claude"` recebem esse
        rótulo de origem — pré-requisito do merge revisável da 2ª passada.
        """
        async with AsyncSessionLocal() as db:
            # Continua a numeração a partir do MAIOR número já usado — robusto a
            # buracos quando o editor apaga cortes do meio (D-298: a análise via
            # Claude passou a ser aditiva, então esse é o caso comum).
            from app.models import Corte
            from sqlalchemy import func, select

            stmt = select(func.max(Corte.numero)).where(Corte.projeto_id == projeto_id)
            result = await db.execute(stmt)
            ultimo_numero = result.scalar() or 0

            from app.domain.time_convert import to_seg

            # D-355: palavras word-level do projeto (fonte da âncora verbatim).
            # Carregadas UMA vez; vazias em projeto sem timing (VTT) → âncora no-op.
            palavras_flat = await AnaliseService._palavras_word_level(db, projeto_id)

            for i, corte_data in enumerate(cortes_data):
                desvios_normalizados = [
                    _normalizar_desvio(_com_origem_de_analise(d, origem))
                    for d in corte_data.get("desvios", [])
                ]

                # Computa inicio_seg/fim_seg a partir de HMS se não fornecidos
                inicio_seg = corte_data.get("inicio_seg")
                if inicio_seg is None or to_seg(inicio_seg or 0.0) == 0.0:
                    inicio_seg = hms_to_seg(corte_data.get("inicio_hms", "00:00:00"))
                else:
                    inicio_seg = to_seg(inicio_seg)

                fim_seg = corte_data.get("fim_seg")
                if fim_seg is None or to_seg(fim_seg or 0.0) == 0.0:
                    fim_seg = hms_to_seg(corte_data.get("fim_hms", "00:00:00"))
                else:
                    fim_seg = to_seg(fim_seg)

                # D-355: ancora as bordas na palavra citada, se houver citação.
                inicio_ancorado, fim_ancorado = _bordas_ancoradas_do_corte(
                    corte_data, inicio_seg, fim_seg, palavras_flat
                )
                ancorado = inicio_ancorado != inicio_seg or fim_ancorado != fim_seg
                inicio_seg, fim_seg = inicio_ancorado, fim_ancorado
                inicio_hms = (
                    seg_to_hms(inicio_seg) if ancorado else corte_data.get("inicio_hms", "00:00:00")
                )
                fim_hms = seg_to_hms(fim_seg) if ancorado else corte_data.get("fim_hms", "00:00:00")

                corte = Corte(
                    id=str(uuid.uuid4()),
                    projeto_id=projeto_id,
                    numero=ultimo_numero + i + 1,
                    titulo_proposto=corte_data.get("titulo_proposto", ""),
                    resumo=corte_data.get("resumo", ""),
                    tema_central=corte_data.get("tema_central", ""),
                    justificativa=(corte_data.get("justificativa") or "").strip(),
                    inicio_hms=inicio_hms,
                    fim_hms=fim_hms,
                    inicio_seg=inicio_seg,
                    fim_seg=fim_seg,
                    desvios=json.dumps(desvios_normalizados, ensure_ascii=False),
                    **_campos_v2_da_proposta(corte_data),
                )
                db.add(corte)
                db.add(_snapshot_da_proposta(corte, origem))

            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                mudar_projeto(projeto, StatusProjeto.ANALISADO, origem="analise")
                projeto.ultima_analise_em = datetime.utcnow()
                # descartados: sobrescreve com o valor recebido (None preserva o
                # anterior; lista vazia zera). Callers que querem MESCLAR com a
                # auditoria anterior (análise aditiva via Claude, D-298) passam a
                # lista já mesclada.
                if descartados is not None:
                    projeto.descartados_analise = json.dumps(descartados, ensure_ascii=False)
            await db.commit()

            # D-448: a numeração acima é só um lugar provisório na fila. Numa
            # análise aditiva (2ª passada, D-298) os cortes novos costumam cair
            # ANTES dos já existentes na live — quem decide a posição final é o
            # tempo, não a ordem de chegada.
            from app.services.corte import CorteService

            await CorteService.renumerar_por_tempo(db, projeto_id)

    @staticmethod
    async def analisar_transcricao(projeto_id: str):
        """Analisa a transcrição via Claude e salva os cortes retornados.

        Delega ao caminho Claude (`ClaudeIaService.analisar_via_claude`), que
        gera os cortes, substitui os existentes e encadeia o refazer-transcrição.
        Mantém a semântica de background task: em falha marca o projeto como ERRO.
        """
        try:
            await AnaliseService.analisar_via_claude(projeto_id)
        except Exception as e:
            async with AsyncSessionLocal() as db:
                projeto = await db.get(Projeto, projeto_id)
                if projeto:
                    mudar_projeto(projeto, StatusProjeto.ERRO, origem="analise")
                    projeto.erro_msg = str(e)
                    await db.commit()

    @staticmethod
    async def analisar_intervalo(projeto_id: str, inicio_seg: float, fim_seg: float):
        """
        Analisa apenas um intervalo de tempo da transcrição e adiciona os cortes
        retornados ao projeto, sem alterar os cortes já existentes.
        """
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto or not projeto.transcricao_raw:
                raise ValueError("Projeto não encontrado ou sem transcrição")

            # Conta cortes existentes para numerar corretamente os novos
            result = await db.execute(
                sa_select(Corte).where(Corte.projeto_id == projeto_id).order_by(Corte.numero)
            )
            cortes_existentes = result.scalars().all()
            proximo_numero = max((c.numero for c in cortes_existentes), default=0) + 1

        transcricao_completa = json.loads(projeto.transcricao_raw)
        transcricao_intervalo = [
            seg
            for seg in transcricao_completa
            if hms_to_seg(seg.get("inicio", "0")) >= inicio_seg
            and hms_to_seg(seg.get("fim", "0")) <= fim_seg
        ]

        if not transcricao_intervalo:
            raise ValueError(
                f"Nenhuma transcrição encontrada no intervalo {inicio_seg}s – {fim_seg}s"
            )

        operational_info(
            "AnalisarIntervalo",
            f"{len(transcricao_intervalo)} segmentos no intervalo {inicio_seg}s-{fim_seg}s",
        )

        # D-299: mesma injeção de rótulo [CANAL]/[OUTRO] que a análise completa
        # (D-286) já faz — aqui sempre que o projeto estiver diarizado, sem
        # toggle (a análise de intervalo não expõe `usar_diarizacao`).
        meta = {
            "titulo_live": projeto.titulo_live or "",
            "youtube_url": projeto.youtube_url or "",
            "duracao_segundos": projeto.duracao_segundos or 0,
            "falantes_map": mapa_falantes_para_meta(projeto.falantes_map),
        }
        resultado = await ClaudeIaService.gerar_cortes(transcricao_intervalo, meta)

        cortes_data = resultado.get("cortes", [])
        if not cortes_data:
            raise ValueError("Claude não retornou cortes para o intervalo informado")

        # D-355: palavras word-level do intervalo já carregado (fonte da âncora).
        palavras_flat = achatar_palavras(transcricao_completa)

        # Salva novos cortes sem remover os existentes
        async with AsyncSessionLocal() as db:
            for i, corte_data in enumerate(cortes_data):
                desvios_normalizados = [
                    _normalizar_desvio(_com_origem_de_analise(d, "claude"))
                    for d in corte_data.get("desvios", [])
                ]

                # Computa inicio_seg/fim_seg a partir de HMS se não fornecidos
                inicio_seg = corte_data.get("inicio_seg")
                if inicio_seg is None or to_seg_estrito(inicio_seg or 0.0) == 0.0:
                    inicio_seg = hms_to_seg(corte_data.get("inicio_hms", "00:00:00"))
                else:
                    inicio_seg = to_seg_estrito(inicio_seg)

                fim_seg = corte_data.get("fim_seg")
                if fim_seg is None or to_seg_estrito(fim_seg or 0.0) == 0.0:
                    fim_seg = hms_to_seg(corte_data.get("fim_hms", "00:00:00"))
                else:
                    fim_seg = to_seg_estrito(fim_seg)

                # D-355: ancora as bordas na palavra citada, se houver citação.
                inicio_ancorado, fim_ancorado = _bordas_ancoradas_do_corte(
                    corte_data, inicio_seg, fim_seg, palavras_flat
                )
                ancorado = inicio_ancorado != inicio_seg or fim_ancorado != fim_seg
                inicio_seg, fim_seg = inicio_ancorado, fim_ancorado
                inicio_hms = (
                    seg_to_hms(inicio_seg) if ancorado else corte_data.get("inicio_hms", "00:00:00")
                )
                fim_hms = seg_to_hms(fim_seg) if ancorado else corte_data.get("fim_hms", "00:00:00")

                corte = Corte(
                    id=str(uuid.uuid4()),
                    projeto_id=projeto_id,
                    numero=proximo_numero + i,
                    titulo_proposto=corte_data.get("titulo_proposto", ""),
                    resumo=corte_data.get("resumo", ""),
                    tema_central=corte_data.get("tema_central", ""),
                    inicio_hms=inicio_hms,
                    fim_hms=fim_hms,
                    inicio_seg=inicio_seg,
                    fim_seg=fim_seg,
                    desvios=json.dumps(desvios_normalizados, ensure_ascii=False),
                    **_campos_v2_da_proposta(corte_data),
                )
                db.add(corte)
                # D-303: intervalo também é proposta de IA (via Claude) — congela.
                db.add(_snapshot_da_proposta(corte, origem="claude"))
            await db.commit()

        operational_info(
            "AnalisarIntervalo",
            f"{len(cortes_data)} novos cortes adicionados (a partir do #{proximo_numero})",
        )
        return {"novos_cortes": len(cortes_data), "primeiro_numero": proximo_numero}

    @staticmethod
    def _meta_do_prompt(projeto: Projeto, duracao_seg: float) -> dict:
        return {
            "titulo_live": projeto.titulo_live or "",
            "youtube_url": projeto.youtube_url or "",
            "duracao_segundos": int(duracao_seg),
        }

    @staticmethod
    def _prompt_manual(texto_transcricao: str, meta: dict, *, cabecalho: str) -> str:
        """D-631: o modo manual usa a MESMA receita da análise automática (skill
        `cortador-expert` + scaffold `cortes` do canal). Antes era um prompt fixo
        no código, com a persona de um canal e divergente do que o canal editou."""
        return ClaudeIaService.montar_prompt_manual_cortes(
            texto_transcricao, meta, cabecalho=cabecalho
        )

    @staticmethod
    async def analisar_via_claude(
        projeto_id: str,
        *,
        encadear_transcricao: bool = True,
        usar_diarizacao: bool = True,
        provider: ProviderIA = "claude",
    ) -> dict:
        """Analisa a transcrição via Claude e ADICIONA os cortes gerados aos que
        já existem no projeto, encadeando (opcional) o refazer-transcrição.

        D-298 — modo aditivo: a análise nunca apaga cortes; deletar é ação
        manual do editor. Os cortes novos seguem a numeração a partir do maior
        número já usado, e um corte novo cujo início cai no mesmo bucket de 30s
        de um corte JÁ EXISTENTE é pulado — evita inundar a live com
        quase-duplicatas quando o projeto é reanalisado. Os `descartados` são
        MESCLADOS com a auditoria anterior (dedup por `tema`), não sobrescritos.
        A skill `cortador-expert` carrega toda a expertise editorial.

        D-286: quando `usar_diarizacao` e o projeto já foi diarizado, injeta o
        rótulo de falante ([CANAL]/[OUTRO]) na transcrição enviada à IA. Sem
        diarização (ou com o toggle desligado) o prompt sai idêntico ao de antes.
        """
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto:
                raise ValueError("Projeto não encontrado")
            if not projeto.transcricao_raw:
                raise ValueError(
                    "Este projeto não tem transcrição gravada. Use 'Refazer transcrição' "
                    "para baixar as legendas do YouTube e então rode a análise."
                )

            transcricao = _carregar_transcricao_raw(projeto.transcricao_raw, projeto_id)
            # D-445: recusar ANTES da chamada paga. Sem esta guarda, uma
            # transcrição que existe mas não tem fala (placeholder de legenda
            # indisponível, dado truncado) só era rejeitada pelo próprio modelo
            # — ~20s e ~US$0,10 de Opus para devolver "não retornou cortes",
            # que não diz ao operador o que fazer.
            motivo = motivo_transcricao_inutilizavel(
                transcricao if isinstance(transcricao, list) else [],
                duracao_video_seg=projeto.duracao_segundos or 0,
            )
            if motivo:
                raise ValueError(motivo)

            meta = {
                "projeto_id": projeto_id,  # D-353: contexto p/ telemetria da geração
                "titulo_live": projeto.titulo_live or "",
                "youtube_url": projeto.youtube_url or "",
                "duracao_segundos": projeto.duracao_segundos or 0,
                "falantes_map": mapa_falantes_para_meta(projeto.falantes_map)
                if usar_diarizacao
                else None,
            }
            status_anterior = projeto.status
            mudar_projeto(projeto, StatusProjeto.ANALISANDO, origem="claude-ia")
            await db.commit()

        try:
            # Gera PRIMEIRO; só persiste depois de ter o resultado. Assim uma
            # falha (ou reload que mate a task) NUNCA deixa o projeto sem cortes.
            payload = await ClaudeIaService.gerar_cortes(transcricao, meta, provider)
            cortes_data = payload.get("cortes", [])
            descartados = payload.get("descartados", [])
            if not cortes_data:
                raise ValueError(AnaliseService._motivo_de_zero_cortes(descartados))

            # Modo aditivo (D-298): lê os cortes e a auditoria que já existem
            # para pular quase-duplicatas e mesclar os descartados — sem apagar.
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    sa_select(Corte.inicio_seg).where(Corte.projeto_id == projeto_id)
                )
                buckets_existentes = {bucket_de_30s(row[0]) for row in result.all()}
                projeto = await db.get(Projeto, projeto_id)
                descartados_anteriores = (
                    json.loads(projeto.descartados_analise or "[]") if projeto else []
                )

            cortes_novos, pulados = AnaliseService._filtrar_cortes_em_buckets(
                cortes_data, buckets_existentes
            )
            descartados_mesclados = mesclar_descartados(descartados_anteriores, descartados)

            # importar_resultado numera a partir do maior número já usado, então
            # os cortes existentes ficam preservados e os novos seguem a sequência.
            await AnaliseService.importar_resultado(
                projeto_id,
                cortes_novos,
                descartados=descartados_mesclados,
                origem=provider,
            )

            if encadear_transcricao:
                await AnaliseService._refazer_transcricao(projeto_id)

            logger.info(
                "[ClaudeIA] Projeto %s analisado via Claude (aditivo): +%d cortes, "
                "%d pulados (bucket já existente), %d descartados",
                projeto_id[:8],
                len(cortes_novos),
                pulados,
                len(descartados_mesclados),
            )
            return {
                "total_cortes": len(cortes_novos),
                "pulados_existentes": pulados,
                "total_descartados": len(descartados_mesclados),
            }

        except Exception:  # noqa: BLE001 — restaura status e propaga (endpoint mostra o erro)
            await AnaliseService._restaurar_status(projeto_id, status_anterior)
            raise

    @staticmethod
    def _motivo_de_zero_cortes(descartados: list) -> str:
        """Monta a mensagem de erro de uma análise que não propôs nada.

        Quando o modelo descarta tudo, ele escreve o porquê em `descartados` —
        e esse texto era jogado fora junto com a resposta, sobrando um "não
        retornou cortes" mudo na tela (D-445). Aqui a explicação dele vira a
        mensagem, que é a única que sabe se o problema foi o material ou a
        régua editorial.
        """
        motivo = next(
            (str(d.get("motivo", "")).strip() for d in descartados or [] if d.get("motivo")),
            "",
        )
        if not motivo:
            return (
                "A IA não propôs nenhum corte para esta live e não registrou o motivo. "
                "Confira se a transcrição tem fala de verdade antes de tentar de novo."
            )
        if len(motivo) > _LIMITE_MOTIVO_NA_TELA:
            motivo = motivo[:_LIMITE_MOTIVO_NA_TELA].rstrip() + "…"
        return f"A IA não propôs nenhum corte. Motivo que ela registrou: {motivo}"

    @staticmethod
    def _filtrar_cortes_em_buckets(cortes: list, buckets_existentes: set[int]) -> tuple[list, int]:
        """Descarta os cortes cujo início cai no bucket de 30s de um corte JÁ
        EXISTENTE do projeto (evita inundar a live com quase-duplicatas numa
        reanálise). Retorna (cortes_a_importar, quantidade_pulada)."""
        novos: list = []
        pulados = 0
        for corte in cortes:
            if bucket_de_30s(corte.get("inicio_seg")) in buckets_existentes:
                pulados += 1
                continue
            novos.append(corte)
        return novos, pulados

    @staticmethod
    async def _refazer_transcricao(projeto_id: str) -> None:
        """Replica o fluxo do botão 'Refazer transcrição': reextrai a legenda e
        sincroniza a transcrição final de cada corte (aplicando os desvios).
        """
        from app.services.corte import CorteService
        from app.services.ingestao import IngestaoService

        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto or not projeto.youtube_url or not projeto.arquivo_video_path:
                logger.info("[ClaudeIA] Sem vídeo para refazer transcrição; pulei a etapa.")
                return
            transcricao = await IngestaoService._extrair_legenda(
                projeto_id,
                projeto.youtube_url,
                legenda_offset_ms=projeto.legenda_offset_ms,
            )
            projeto.transcricao_raw = json.dumps(transcricao, ensure_ascii=False)
            await db.commit()

            result = await db.execute(sa_select(Corte.id).where(Corte.projeto_id == projeto_id))
            corte_ids = [row[0] for row in result.all()]

        # Cada sincronização abre a própria sessão (db=None) — isola commits.
        for corte_id in corte_ids:
            await CorteService.sincronizar_transcricao_corte(corte_id)
        logger.info("[ClaudeIA] Refazer transcrição: %d cortes sincronizados", len(corte_ids))

    @staticmethod
    async def _restaurar_status(projeto_id: str, status) -> None:
        """Restaura o status anterior do projeto (usado quando a análise falha,
        para não deixar o projeto preso em ANALISANDO nem perder os cortes)."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                mudar_projeto(projeto, status, origem="claude-ia: restaurar anterior")
                await db.commit()
