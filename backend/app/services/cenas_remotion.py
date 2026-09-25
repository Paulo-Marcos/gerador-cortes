import asyncio
import json
import logging
import time
from datetime import datetime

from app.core.logging import operational_debug, operational_error, operational_info
from app.database import AsyncSessionLocal
from app.domain.canal.variacao_prompt import bloco_variacao_de
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.compartilhado.manual_prompt import pedir_resposta_json_em_bloco_codigo
from app.domain.compartilhado.provider_ia import ProviderIA
from app.domain.compartilhado.time_convert import hms_to_seg
from app.domain.corte.corte_mapper import (
    cenas_fora_do_corte,
    coalescer_chaves_mascote,
    extrair_cenas_remotion,
)
from app.domain.projeto.diarizacao_align import prefixo_falante
from app.infrastructure import fila_ia, gemini_client
from app.models import Corte, Projeto
from app.services import retrato_wikipedia
from app.services.canal import editorial_scaffolds, editorial_skills
from app.services.claude_ia import gerar_json, registrar_skill_usada
from sqlalchemy import select
from sqlalchemy.orm import selectinload

# Faixas de duração do corte para os pisos de cenas.
_CORTE_CURTO_SEG = 60
_CORTE_MEDIO_SEG = 180

logger = logging.getLogger(__name__)

# A skill que escreve as cenas do corte — a geração pela IA mora aqui (D-704).
_SKILL_CENAS = "cenas-expert"


def _carregar_mapa_falantes(raw: object) -> dict | None:
    """Parse tolerante do `projeto.falantes_map` (D-286/D-307).

    Retorna `None` (sem rótulo) quando o projeto não foi diarizado ou o JSON é
    inválido — nesse caso o prompt de cenas sai idêntico ao comportamento
    pré-diarização (back-compat total). Espelha `diarizacao_align.mapa_falantes_para_meta`
    do fluxo de análise/trechos (D-696: a unificação das duas é do E-054).
    """
    if not raw or not isinstance(raw, str):
        return None
    try:
        mapa = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return mapa if isinstance(mapa, dict) and mapa else None


PROMPT_CENAS_CHUNK_TAMANHO_SEG = 900.0
PROMPT_CENAS_OVERLAP_SEG = 120.0
PROMPT_CENAS_MIN_LAST_SEG = 300.0


def _to_seg(val) -> float:
    """Converte valor para float (segundos), suportando HH:MM:SS."""
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(val)
    except (ValueError, TypeError):
        return hms_to_seg(str(val))


def _calcular_limites(duracao_seg: int) -> dict:
    """Limites numéricos (TETO) de cenas por parte, injetados no prompt.

    A densidade-alvo editorial é calma — canal analítico, público maduro, ~1 cena
    a cada 60–90s (over-editing reduz retenção nesse público). O `max_cenas` daqui
    é um TETO, não uma meta: o prompt instrui a não preenchê-lo. `cenas_por_min`
    fixa esse teto no limite denso do alvo (~1 cena/min).
    """
    cenas_por_min = 1.0
    duracao_min = max(0.5, duracao_seg / 60.0)
    max_cenas = int(round(duracao_min * cenas_por_min))

    # Pisos por faixa (evita corte muito curto sem identidade)
    if duracao_seg < _CORTE_CURTO_SEG:
        max_cenas = max(max_cenas, 2)
    elif duracao_seg < _CORTE_MEDIO_SEG:
        max_cenas = max(max_cenas, 4)
    else:
        max_cenas = max(max_cenas, 6)

    # Teto absoluto (vídeo de 30min+ nunca passa de 40)
    max_cenas = min(max_cenas, 40)

    return {
        "max_cenas": max_cenas,
        "max_identidade": max(2, max_cenas // 3),
        "max_fullscreen": max(1, max_cenas // 8),
        "min_primeiros_15s": 1 if duracao_seg < _CORTE_CURTO_SEG else 2,
    }


_url_retrato_para_remotion = retrato_wikipedia.url_para_remotion


def _extrair_cenas_payload(payload: object) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("cenas"), list):
        return payload["cenas"]
    return []


def _payload_com_cenas(payload: object, cenas: list) -> object:
    if isinstance(payload, dict):
        return {**payload, "cenas": cenas}
    return cenas


def _stats_retratos() -> dict:
    return {
        "total_fichas": 0,
        "atualizados": 0,
        "ja_tinham": 0,
        "nao_encontrados": 0,
        "sem_nome": 0,
        "erros": 0,
        "nomes_sem_retrato": [],
        "nomes_com_erro": [],
    }


class CenasRemotionService:
    @staticmethod
    async def validar(corte_id: str, validado: bool) -> Corte:
        """Marca — ou desmarca — as cenas do corte como conferidas pelo editor (D-705).

        Validar exige ao menos uma cena salva no roteiro visual; desfazer, não.
        """
        async with AsyncSessionLocal() as db:
            async with db.begin():
                corte = await _corte_com_metadado(db, corte_id)
                if not corte:
                    raise NaoEncontrado("Corte nao encontrado")
                if validado:
                    if not extrair_cenas_remotion(json.loads(corte.cenas_remotion or "[]")):
                        raise PedidoInvalido(
                            "Nao ha cenas para validar. Gere ou importe cenas antes."
                        )
                    corte.cenas_validadas = 1
                    corte.cenas_validadas_em = datetime.utcnow()
                else:
                    corte.cenas_validadas = 0
                    corte.cenas_validadas_em = None
            # Relido depois do commit: colunas com onupdate voltariam expiradas.
            return await _corte_com_metadado(db, corte_id)

    @staticmethod
    async def gerar_cenas_via_claude(corte_id: str, provider: ProviderIA = "claude") -> dict:
        """Gera as cenas Remotion de um corte via Claude (skill cenas-expert).

        Reaproveita o prompt detalhado (que carrega o schema) e o importador de
        cenas já existentes. Se o corte for longo, o prompt vem particionado —
        geramos por parte e concatenamos as cenas antes de importar.
        """
        # D-435: a fila só via as cenas quando o Claude CLI anunciava CADA
        # chamada, então montar o prompt, importar retratos e qualquer falha
        # antes da 1ª chamada aconteciam sem item nenhum na fila — e a geração
        # automática disparada pelo bruto parecia não existir. Anunciamos a fase
        # inteira sob a MESMA chave que as chamadas internas usam, de modo que
        # elas apenas atualizam este item em vez de criar outro.
        # BaseException, e não Exception: um CancelledError (reload do backend,
        # task morta) deixaria o item preso na fila como "em andamento".
        chave_fila = fila_ia.anunciar_inicio(_SKILL_CENAS, corte_id=corte_id)
        try:
            resultado = await CenasRemotionService._gerar_cenas(corte_id, provider)
        except BaseException as exc:
            fila_ia.anunciar_fim(chave_fila, sucesso=False, erro=fila_ia.mensagem_de(exc))
            raise
        fila_ia.anunciar_fim(chave_fila, sucesso=True)
        return resultado

    @staticmethod
    async def _gerar_cenas(corte_id: str, provider: ProviderIA = "claude") -> dict:
        """Corpo da geração de cenas — ver `gerar_cenas_via_claude`."""
        logger.info("[ClaudeIA/cenas] iniciando corte %s", corte_id[:8])
        t_mp = time.perf_counter()
        info = await CenasRemotionService.montar_prompt(corte_id)
        prompts = info.get("prompts") or []
        logger.info(
            "[ClaudeIA/cenas] montar_prompt: %d chunk(s) em %.1fs",
            len(prompts),
            time.perf_counter() - t_mp,
        )
        if not prompts:
            raise ValueError("Sem prompt de cenas (transcrição final vazia?).")

        skill = editorial_skills.resolver_skill(_SKILL_CENAS)
        registrar_skill_usada(_SKILL_CENAS, skill)
        # Uma lente por geração (consistente entre as partes), do banco por canal.
        variacao = bloco_variacao_de(skill.lentes)
        cenas: list = []
        for indice, parte in enumerate(prompts):
            prompt = f"{variacao}\n\n{parte['texto']}"
            t = time.perf_counter()
            resultado = await gerar_json(provider, prompt, skill, _SKILL_CENAS, corte_id=corte_id)
            novas = resultado.get("cenas", [])
            cenas.extend(novas)
            logger.info(
                "[ClaudeIA/cenas] corte %s chunk %d/%d: %d cenas (Claude) em %.1fs",
                corte_id[:8],
                indice + 1,
                len(prompts),
                len(novas),
                time.perf_counter() - t,
            )

        if not cenas:
            raise ValueError("Claude não retornou cenas.")

        t_imp = time.perf_counter()
        await CenasRemotionService.importar_cenas(corte_id, {"cenas": cenas})
        logger.info(
            "[ClaudeIA/cenas] corte %s: importar_cenas (retratos + save) em %.1fs",
            corte_id[:8],
            time.perf_counter() - t_imp,
        )
        logger.info(
            "[ClaudeIA] Cenas geradas via Claude p/ corte %s: %d cenas",
            corte_id[:8],
            len(cenas),
        )
        return {"total_cenas": len(cenas)}

    @staticmethod
    async def montar_prompt(corte_id: str, transcricao_override: list = None) -> dict:
        """Retorna o prompt completo para geração de cenas sem chamar a IA."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError(f"Corte '{corte_id}' não encontrado.")

            if transcricao_override is not None:
                transcricao_final = transcricao_override
            else:
                transcricao_final = json.loads(corte.transcricao_final or "[]")

            if not transcricao_final:
                raise ValueError("Transcrição final vazia.")
            dur_bruta = (corte.fim_seg or 0) - (corte.inicio_seg or 0)

            operational_debug(
                "CenasRemotion",
                f"Montando prompt para '{corte.titulo_proposto}'. "
                f"Primeiro segmento: {transcricao_final[0].get('start', 0)}s",
            )

            from app.domain.projeto.chunker import fatiar_transcricao

            # 1. Primeiro garante a granularidade (evita blocos de texto gigantes)
            # 1. Granulariza a transcrição inteira primeiro e atribui índices globais
            transcricao_granular = CenasRemotionService._get_granular(transcricao_final)
            CenasRemotionService._exigir_transcricao_dentro_do_corte(
                transcricao_granular, dur_bruta
            )

            # 1b. D-307: em projeto diarizado, anota o falante ([CANAL]/[OUTRO]) em
            # cada segmento para a IA distinguir a tese do canal da fala reagida.
            # Sem diarização (ou com override de short), `mapa_falantes` fica None e
            # o prompt sai idêntico ao pré-D-307.
            transcricao_granular, mapa_falantes = await CenasRemotionService._resolver_diarizacao(
                db, corte, transcricao_granular, transcricao_override
            )

            # 2. Depois fatia em blocos de 15 minutos, com leve sobreposição para contexto
            chunks = fatiar_transcricao(
                transcricao_granular,
                chunk_tamanho_seg=PROMPT_CENAS_CHUNK_TAMANHO_SEG,
                overlap_seg=PROMPT_CENAS_OVERLAP_SEG,
                min_last_chunk_seg=PROMPT_CENAS_MIN_LAST_SEG,
            )

            prompts = []
            for i, chunk in enumerate(chunks):
                legendas_numeradas = CenasRemotionService._montar_legendas_numeradas(
                    chunk, mapa_falantes
                )
                duracao_estimada = 0
                if chunk:
                    ultimo = chunk[-1]
                    duracao_estimada = int(_to_seg(ultimo.get("end", ultimo.get("fim", 0))))
                    primeiro = chunk[0]
                    inicio_estimado = int(_to_seg(primeiro.get("start", primeiro.get("inicio", 0))))
                    duracao_estimada -= inicio_estimado

                limites = _calcular_limites(duracao_estimada)
                cabecalho_parte = f"*** ATENÇÃO: Esta é a PARTE {i + 1} de {len(chunks)} do vídeo. Gere as cenas APENAS para as legendas listadas abaixo. ***\n\n"
                prompt_chunk = cabecalho_parte + editorial_scaffolds.resolver_scaffold(
                    "cenas"
                ).format(
                    titulo=corte.titulo_proposto,
                    tema_central=corte.tema_central,
                    resumo=corte.resumo,
                    duracao_estimada=duracao_estimada,
                    legendas_numeradas=legendas_numeradas,
                    max_cenas=limites["max_cenas"],
                    max_identidade=limites["max_identidade"],
                    max_fullscreen=limites["max_fullscreen"],
                    min_primeiros_15s=limites["min_primeiros_15s"]
                    if i == 0
                    else 0,  # só obriga hook na primeira parte
                    # B (D-295 folding): fonte única da abertura contextual — a frase
                    # que o cortador-expert já produziu p/ o corte. Opcionais no
                    # scaffold; só a 1ª parte carrega o gancho (i == 0).
                    contextualizacao=(corte.contextualizacao or "").strip() if i == 0 else "",
                    frase_gancho=(corte.frase_gancho_texto or "").strip() if i == 0 else "",
                )
                prompts.append(
                    {
                        "parte": i + 1,
                        "total_partes": len(chunks),
                        "texto": pedir_resposta_json_em_bloco_codigo(prompt_chunk),
                    }
                )

        prompt_agregado = "\n\n========== PRÓXIMA PARTE ==========\n\n".join(
            p["texto"] for p in prompts
        )

        return {
            "prompt": prompt_agregado,
            "prompts": prompts,
            "formato_esperado": {
                "formato": "cortes",
                "cenas": [
                    {
                        "tipo": "pergunta_transicao",
                        "startLeg": 2,
                        "duracao_s": 4,
                        "texto": "...",
                        "mascotMood": "apresentador",
                    }
                ],
            },
        }

    @staticmethod
    @staticmethod
    def _exigir_transcricao_dentro_do_corte(transcricao_granular: list, dur_bruta: float) -> None:
        """Barra a geração quando a transcrição não cabe no corte.

        A cena herda o tempo da transcrição (`_resolver_startleg` devolve o
        `start` de um segmento), então uma transcrição em tempo de LIVE produz
        cenas em tempo de live — e o descarte lá no fim já custou a chamada de
        IA inteira. Verificar ANTES falha em milissegundos e não gasta recurso.
        """
        if dur_bruta <= 0 or not transcricao_granular:
            return
        fora = [
            _to_seg(seg.get("start", seg.get("inicio", 0)))
            for seg in transcricao_granular
            if isinstance(seg, dict) and _to_seg(seg.get("start", seg.get("inicio", 0))) > dur_bruta
        ]
        if not fora:
            return
        raise ValueError(
            f"Transcrição do corte fora do intervalo: {len(fora)} de "
            f"{len(transcricao_granular)} segmento(s) além de {dur_bruta:.0f}s "
            f"(maior: {max(fora):.0f}s). Sincronize a transcrição do corte antes "
            "de gerar as cenas — gerar assim produziria cenas em tempo de live."
        )

    @staticmethod
    def _descartar_cenas_fora_do_corte(cenas: list, dur_bruta: float) -> list:
        """Remove cenas com tempo fora do corte e devolve só as aproveitáveis.

        `importar_cenas` e `gerar_cenas` escrevem `cenas_remotion` DIRETO, sem
        passar pelo `atualizar_corte`. O teto é o span BRUTO (>= a duração
        líquida), então um trecho removido nunca gera falso positivo.

        DESCARTA em vez de abortar: abortar deixava as cenas ANTIGAS no banco e
        o operador ficava preso — regerava, nada mudava, e o defeito continuava
        na tela. Descartando, a regeneração sempre avança e o payload ruim não
        entra. O que foi descartado vai para o log.
        """
        fora = cenas_fora_do_corte(cenas, dur_bruta)
        if not fora:
            return cenas
        exemplo = max(fora, key=lambda c: c["inicio"])
        operational_info(
            "CenasRemotion",
            f"⚠️ {len(fora)} de {len(cenas)} cena(s) descartadas por tempo fora do "
            f"corte (limite {dur_bruta:.0f}s; maior: cena {exemplo['indice']} em "
            f"{exemplo['inicio']:.0f}s-{exemplo['fim']:.0f}s).",
        )
        descartados = {c["indice"] for c in fora}
        return [cena for idx, cena in enumerate(cenas) if idx not in descartados]

    @staticmethod
    async def importar_cenas(corte_id: str, payload: dict) -> dict:
        """Recebe resultado de IA externa, normaliza e salva as cenas."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError(f"Corte '{corte_id}' não encontrado.")

            transcricao_final = json.loads(corte.transcricao_final or "[]")
            if not transcricao_final:
                raise ValueError("Transcrição final vazia.")
            dur_bruta = (corte.fim_seg or 0) - (corte.inicio_seg or 0)

        # IMPORTANTE: Granularizar igual ao prompt para os índices baterem
        transcricao_granular = CenasRemotionService._get_granular(transcricao_final)
        CenasRemotionService._exigir_transcricao_dentro_do_corte(transcricao_granular, dur_bruta)
        cenas_raw = payload if isinstance(payload, list) else payload.get("cenas", [])
        cenas_convertidas = CenasRemotionService._converter_startleg(
            cenas_raw, transcricao_granular
        )
        cenas_convertidas = CenasRemotionService._descartar_cenas_fora_do_corte(
            cenas_convertidas, dur_bruta
        )
        retratos = await CenasRemotionService._preencher_retratos_cenas(cenas_convertidas)

        resultado = {
            "formato": "cortes",
            "cenas": cenas_convertidas,
            "retratos": retratos,
        }

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            corte.cenas_remotion = json.dumps(resultado, ensure_ascii=False)
            await db.commit()

        return resultado

    @staticmethod
    async def gerar_cenas(corte_id: str) -> dict:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError(f"Corte '{corte_id}' não encontrado.")

            transcricao_final = json.loads(corte.transcricao_final or "[]")
            if not transcricao_final:
                raise ValueError("Transcrição final vazia.")

            transcricao_granular = CenasRemotionService._get_granular(transcricao_final)
            CenasRemotionService._exigir_transcricao_dentro_do_corte(
                transcricao_granular, (corte.fim_seg or 0) - (corte.inicio_seg or 0)
            )
            from app.domain.projeto.chunker import fatiar_transcricao

            chunks = fatiar_transcricao(
                transcricao_granular,
                chunk_tamanho_seg=PROMPT_CENAS_CHUNK_TAMANHO_SEG,
                overlap_seg=PROMPT_CENAS_OVERLAP_SEG,
                min_last_chunk_seg=PROMPT_CENAS_MIN_LAST_SEG,
            )

            prompts = []
            for i, chunk in enumerate(chunks):
                legendas_numeradas = CenasRemotionService._montar_legendas_numeradas(chunk)
                duracao_estimada = 0
                if chunk:
                    ultimo = chunk[-1]
                    duracao_estimada = int(_to_seg(ultimo.get("end", ultimo.get("fim", 0))))
                    primeiro = chunk[0]
                    inicio_estimado = int(_to_seg(primeiro.get("start", primeiro.get("inicio", 0))))
                    duracao_estimada -= inicio_estimado

                limites = _calcular_limites(duracao_estimada)
                cabecalho_parte = f"*** ATENÇÃO: Esta é a PARTE {i + 1} de {len(chunks)} do vídeo. Gere as cenas APENAS para as legendas listadas abaixo. ***\n\n"
                prompts.append(
                    {
                        "parte": i + 1,
                        "total_partes": len(chunks),
                        "texto": cabecalho_parte
                        + editorial_scaffolds.resolver_scaffold("cenas").format(
                            titulo=corte.titulo_proposto,
                            tema_central=corte.tema_central,
                            resumo=corte.resumo,
                            duracao_estimada=duracao_estimada,
                            legendas_numeradas=legendas_numeradas,
                            max_cenas=limites["max_cenas"],
                            max_identidade=limites["max_identidade"],
                            max_fullscreen=limites["max_fullscreen"],
                            min_primeiros_15s=limites["min_primeiros_15s"] if i == 0 else 0,
                            # B (D-295 folding): abertura contextual reusa a frase do
                            # cortador-expert; opcionais no scaffold, só na 1ª parte.
                            contextualizacao=(corte.contextualizacao or "").strip()
                            if i == 0
                            else "",
                            frase_gancho=(corte.frase_gancho_texto or "").strip() if i == 0 else "",
                        ),
                    }
                )

            todas_cenas = []
            operational_info("CenasRemotion", f"Gerando cenas em {len(prompts)} parte(s)...")
            for prompt_info in prompts:
                operational_info(
                    "CenasRemotion",
                    f"Chamando Gemini para parte "
                    f"{prompt_info['parte']}/{prompt_info['total_partes']}...",
                )
                try:
                    resultado_ia = await gemini_client.generate_json(
                        "gemini-2.5-flash",
                        prompt_info["texto"],
                        temperature=0.7,
                        contexto=gemini_client.GeminiCallContext(
                            etapa="cenas-gemini", corte_id=corte_id
                        ),
                    )
                except Exception as gem_err:
                    operational_error(
                        "CenasRemotion",
                        f"❌ Erro na chamada do Gemini (parte {prompt_info['parte']}): {gem_err}",
                    )
                    raise

                if isinstance(resultado_ia, list):
                    cenas_parte = resultado_ia
                else:
                    cenas_parte = resultado_ia.get("cenas", [])

                todas_cenas.extend(cenas_parte)

            operational_info("CenasRemotion", "Resposta da IA recebida. Processando cenas...")
            cenas_convertidas = CenasRemotionService._converter_startleg(
                todas_cenas, transcricao_granular
            )
            cenas_convertidas = CenasRemotionService._descartar_cenas_fora_do_corte(
                cenas_convertidas, (corte.fim_seg or 0) - (corte.inicio_seg or 0)
            )
            retratos = await CenasRemotionService._preencher_retratos_cenas(cenas_convertidas)
            operational_info(
                "CenasRemotion", f"{len(cenas_convertidas)} cenas convertidas com sucesso."
            )

            resultado = {
                "formato": "cortes",
                "cenas": cenas_convertidas,
                "retratos": retratos,
            }

            corte.cenas_remotion = json.dumps(resultado, ensure_ascii=False)
            await db.commit()
            operational_info("CenasRemotion", f"✅ Cenas salvas no banco para o corte {corte_id}.")
            return resultado

    @staticmethod
    async def preencher_retratos(corte_id: str, forcar: bool = False) -> dict:
        """Preenche retratos das cenas `ficha_biografica` ja salvas no corte."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError(f"Corte '{corte_id}' nao encontrado.")

            payload = json.loads(corte.cenas_remotion or "[]")

        cenas = _extrair_cenas_payload(payload)
        retratos = await CenasRemotionService._preencher_retratos_cenas(
            cenas,
            forcar=forcar,
        )

        if retratos["atualizados"] > 0:
            async with AsyncSessionLocal() as db:
                corte = await db.get(Corte, corte_id)
                if not corte:
                    raise ValueError(f"Corte '{corte_id}' nao encontrado.")
                corte.cenas_remotion = json.dumps(
                    _payload_com_cenas(payload, cenas),
                    ensure_ascii=False,
                )
                await db.commit()

        return {
            "message": "Busca de retratos concluida.",
            "corte_id": corte_id,
            "retratos": retratos,
            "cenas": cenas,
        }

    @staticmethod
    async def _preencher_retratos_cenas(cenas: list, forcar: bool = False) -> dict:
        # WHY paralelo: cada busca de retrato (Wikipedia PT+EN + download) leva
        # até ~30s; serial, com vários `ficha_biografica`, isso virava minutos —
        # era o que travava a etapa de cenas (metadados não busca retrato).
        t0 = time.perf_counter()
        stats = _stats_retratos()

        # 1) Contabiliza fichas/já-tinham/sem-nome e junta os nomes a buscar.
        nomes_a_buscar: list[str] = []
        for cena in cenas:
            if not isinstance(cena, dict) or cena.get("tipo") != "ficha_biografica":
                continue
            stats["total_fichas"] += 1
            nome = str(cena.get("texto") or "").strip()
            if not nome:
                stats["sem_nome"] += 1
                continue
            retrato_atual = str(cena.get("retrato_url") or "").strip()
            if retrato_atual and not forcar:
                url_normalizada = _url_retrato_para_remotion(retrato_atual)
                if url_normalizada != retrato_atual:
                    cena["retrato_url"] = url_normalizada
                    stats["atualizados"] += 1
                stats["ja_tinham"] += 1
                continue
            if nome not in nomes_a_buscar:
                nomes_a_buscar.append(nome)

        # 2) Busca os nomes EM PARALELO (cap 5), com log cronometrado por pessoa.
        cache_por_nome: dict[str, tuple[str | None, bool]] = {}
        if nomes_a_buscar:
            sem = asyncio.Semaphore(5)

            async def _fetch(nome: str) -> tuple[str, tuple[str | None, bool]]:
                async with sem:
                    ti = time.perf_counter()
                    res = await CenasRemotionService._buscar_url_retrato(nome, forcar)
                    estado = "ok" if res[0] else ("erro" if res[1] else "nao_encontrado")
                    logger.info(
                        "[Cenas/retrato] '%s' -> %s em %.1fs",
                        nome,
                        estado,
                        time.perf_counter() - ti,
                    )
                    return nome, res

            for nome, res in await asyncio.gather(*[_fetch(n) for n in nomes_a_buscar]):
                cache_por_nome[nome] = res

        # 3) Atribui as URLs às cenas e contabiliza erros/não-encontrados.
        for cena in cenas:
            if not isinstance(cena, dict) or cena.get("tipo") != "ficha_biografica":
                continue
            nome = str(cena.get("texto") or "").strip()
            if not nome or nome not in cache_por_nome:
                continue
            url_retrato, teve_erro = cache_por_nome[nome]
            if url_retrato is None:
                if teve_erro:
                    stats["erros"] += 1
                    stats["nomes_com_erro"].append(nome)
                else:
                    stats["nao_encontrados"] += 1
                    stats["nomes_sem_retrato"].append(nome)
                continue
            if cena.get("retrato_url") != url_retrato:
                cena["retrato_url"] = url_retrato
                stats["atualizados"] += 1

        logger.info(
            "[Cenas/retratos] %d ficha(s), %d nome(s) buscado(s) em %.1fs",
            stats["total_fichas"],
            len(nomes_a_buscar),
            time.perf_counter() - t0,
        )
        return stats

    @staticmethod
    async def _buscar_url_retrato(nome: str, forcar: bool) -> tuple[str | None, bool]:
        try:
            retrato = await retrato_wikipedia.buscar_wikipedia(
                nome=nome,
                forcar_redownload=forcar,
            )
        except Exception as exc:  # noqa: BLE001 — retrato é opcional: a cena segue sem ele
            logger.warning("Falha ao buscar retrato para '%s': %s", nome, exc)
            return None, True

        if retrato is None:
            return None, False
        return _url_retrato_para_remotion(retrato.url_publica), False

    @staticmethod
    def _get_granular(transcricao: list) -> list:
        """Centraliza a lógica de granularização para garantir que os índices sempre batam."""
        from app.domain.projeto.transcricao_utils import (
            dividir_segmentos_longos,
            limpar_e_ordenar_transcricao,
        )

        transcricao_limpa = limpar_e_ordenar_transcricao(transcricao)
        granular = dividir_segmentos_longos(transcricao_limpa, max_duracao=4.0, max_palavras=6)
        for idx, seg in enumerate(granular):
            seg["global_index"] = idx
        return granular

    @staticmethod
    def _montar_legendas_numeradas(
        transcricao_chunk: list, mapa_falantes: dict | None = None
    ) -> str:
        from app.domain.compartilhado.time_convert import seg_to_hms_short

        # Usa os índices globais já atribuídos na lista original
        linhas = []
        for item in transcricao_chunk:
            texto = item.get("texto", "").strip()
            if not texto:
                continue

            t_start = _to_seg(item.get("start", item.get("inicio", 0)))
            hms = seg_to_hms_short(t_start)
            idx_global = item.get("global_index", 0)
            # D-307: prefixo [CANAL]/[OUTRO] quando há mapa e o segmento tem falante;
            # sem mapa (ou sem `speaker`) `prefixo_falante` devolve "" — saída idêntica.
            prefixo = prefixo_falante(item.get("speaker"), mapa_falantes)
            linhas.append(f"[{idx_global}] ({hms}) {prefixo}{texto}")

        return "\n".join(linhas)

    @staticmethod
    async def _resolver_diarizacao(
        db, corte: Corte, transcricao_granular: list, transcricao_override: list | None
    ) -> tuple[list, dict | None]:
        """D-307/D-309: resolve o mapa de falantes para anotar [CANAL]/[OUTRO]
        nas legendas do prompt de cenas, devolvendo `(granular, mapa_falantes)`.

        Desde a D-309 a `transcricao_final` do corte PRESERVA o `speaker` por
        segmento (a sincronização não o descarta mais), então os segmentos
        granulares já chegam rotulados — basta devolver o mapa do projeto. Não é
        mais preciso reprojetar os turnos da `transcricao_raw` por sobreposição:
        a antiga divergência de timeline (final editada × raw absoluta) deixou de
        existir porque o rótulo viaja junto com o segmento.

        Devolve `mapa=None` (prompt idêntico ao pré-D-307, back-compat total) em
        três casos, sem nunca quebrar a geração de cenas:
        - short com transcrição própria (timeline distinta);
        - projeto não diarizado (sem mapa de falantes);
        - corte antigo cuja `transcricao_final` foi gerada antes da D-309 e ainda
          não tem `speaker` — reeditar/re-sincronizar o corte restaura os rótulos.
        """
        # Short usa uma transcrição própria (timeline distinta): rotular contra os
        # segmentos do corte seria incorreto — mantém-se o comportamento anterior.
        if transcricao_override is not None:
            return transcricao_granular, None

        projeto = await db.get(Projeto, corte.projeto_id)
        mapa = _carregar_mapa_falantes(getattr(projeto, "falantes_map", None))
        if not mapa:
            return transcricao_granular, None

        # Fallback seguro (corte sincronizado antes da D-309): sem `speaker` nos
        # segmentos não há o que rotular, então segue sem prefixo.
        tem_falante = any(
            isinstance(seg, dict) and seg.get("speaker") for seg in transcricao_granular
        )
        if not tem_falante:
            return transcricao_granular, None

        return transcricao_granular, mapa

    @staticmethod
    def _resolver_startleg(start_leg: int, transcricao: list) -> float:
        """
        Converte startLeg -> inicio_seg.

        A IA às vezes confunde o índice do item com o valor de tempo em segundos
        (que aparece entre parênteses nas legendas numeradas). Para evitar que
        cenas caiam todas no último segundo quando startLeg > len(transcricao),
        tratamos valores fora do intervalo como tempo em segundos e encontramos
        o item mais próximo.
        """
        if not transcricao:
            return 0.0

        if start_leg < len(transcricao):
            item = transcricao[start_leg]
            return _to_seg(item.get("start", item.get("inicio", 0)))

        # startLeg provavelmente é o tempo em segundos — achar item mais próximo
        target_time = _to_seg(start_leg)
        closest = min(
            transcricao,
            key=lambda x: abs(_to_seg(x.get("start", x.get("inicio", 0))) - target_time),
        )
        return _to_seg(closest.get("start", closest.get("inicio", 0)))

    @staticmethod
    def _converter_startleg(cenas_ia: list, transcricao: list) -> list:
        cenas_convertidas = [
            _converter_cena(
                cena,
                CenasRemotionService._resolver_startleg(int(cena.get("startLeg", 0)), transcricao),
            )
            for cena in cenas_ia
        ]

        # Ordenar sempre por tempo de início crescente
        cenas_convertidas.sort(key=lambda x: x.get("inicio", 0))

        return cenas_convertidas


async def _corte_com_metadado(db, corte_id: str) -> Corte | None:
    resultado = await db.execute(
        select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
    )
    return resultado.scalar_one_or_none()


def _converter_cena(cena: dict, inicio_seg: float) -> dict:
    """Uma cena da IA como ela é gravada (D-716: saiu do laço de `_converter_startleg`)."""
    duracao_s = cena.get("duracao_s", 5)
    cena_convertida = {
        "tipo": cena.get("tipo", "barra_inferior"),
        "inicio": round(inicio_seg, 2),
        "fim": round(inicio_seg + duracao_s, 2),
    }
    _copiar_campos_simples(cena, cena_convertida)
    _copiar_mascote(cena, cena_convertida)
    _aplicar_padroes_de_layout(cena_convertida)
    # Normalizar campos que a IA pode gerar com nomes errados
    _ALTERNATIVOS_POR_TIPO.get(cena_convertida["tipo"], _sem_alternativos)(cena, cena_convertida)
    _copiar_listas(cena, cena_convertida)
    return cena_convertida


def _copiar_campos_simples(cena: dict, cena_convertida: dict) -> None:
    campos_simples = [
        "texto",
        "subtexto",
        "icone",
        "numero",
        "cor",
        "contexto",
        "nome_curto",
        "rotuloA",
        "rotuloB",
        "autor",
        "obra",
        "ano",
        "fonte",
        "textura",
        "ancoraLegendas",
        "motivo",
        "retrato_url",
        "layout_card",
        "modelo_cena",
        "sombra_nivel",
    ]
    for campo in campos_simples:
        if cena.get(campo) is not None:
            cena_convertida[campo] = cena[campo]


def _copiar_mascote(cena: dict, cena_convertida: dict) -> None:
    # Mascote (D-186): a IA/canais legados podem emitir sapoMood/sapoPosicao/
    # sapoTamanho; a escrita passa a usar as chaves novas mascot*. O coalescer
    # traduz o nome legado para o novo antes de salvar.
    cena_mascote = coalescer_chaves_mascote(cena)
    for campo in ("mascotMood", "mascotPosicao", "mascotTamanho"):
        if cena_mascote.get(campo) is not None:
            cena_convertida[campo] = cena_mascote[campo]


def _aplicar_padroes_de_layout(cena_convertida: dict) -> None:
    if cena_convertida.get("layout_card") is None:
        cena_convertida["layout_card"] = "auto"
    if cena_convertida.get("sombra_nivel") is None:
        cena_convertida["sombra_nivel"] = "auto"
    # I-031: tela_cheia sempre vira card no salvamento; demais cenas
    # caem em card como default quando IA omite/auto.
    if cena_convertida.get("tipo") == "tela_cheia":
        cena_convertida["modelo_cena"] = "card"
    elif cena_convertida.get("modelo_cena") in (None, "", "auto"):
        cena_convertida["modelo_cena"] = "card"


def _copiar_listas(cena: dict, cena_convertida: dict) -> None:
    for campo in ["marcos", "itens"]:
        valor = cena.get(campo)
        if isinstance(valor, list) and valor:
            cena_convertida[campo] = valor


def _preencher_com_alternativo(
    cena: dict, cena_convertida: dict, campo: str, alternativos: tuple[str, ...]
) -> None:
    """O primeiro nome alternativo presente preenche o campo que não veio."""
    if campo in cena_convertida:
        return
    for alias in alternativos:
        if alias in cena:
            cena_convertida[campo] = str(cena[alias])
            return


def _alternativos_do_destaque(cena: dict, cena_convertida: dict) -> None:
    # IA pode usar o campo "valor"/"data"/"stat" em vez de "numero".
    # D-429: o valor é preservado como veio. A coerção antiga para
    # float assumia formato pt-BR e destruía o token — "45.7" virava
    # 457 e "15/09/1850" caía no except. Quem lê o valor é o render,
    # que decompõe prefixo/núcleo/sufixo (numeroFit.analisarNumeroDestaque).
    for alias in ("valor", "data", "stat"):
        if alias in cena and "numero" not in cena_convertida:
            valor_alias = cena[alias]
            cena_convertida["numero"] = (
                valor_alias if isinstance(valor_alias, (int, float)) else str(valor_alias).strip()
            )
            break


def _alternativos_da_fonte(cena: dict, cena_convertida: dict) -> None:
    # IA pode usar "referencia" ou "source" em vez de "fonte"
    _preencher_com_alternativo(cena, cena_convertida, "fonte", ("referencia", "source", "ref"))


def _alternativos_da_chamada_final(cena: dict, cena_convertida: dict) -> None:
    # IA pode usar "titulo"/"cta"/"botao" em vez de "texto"/"subtexto"
    _preencher_com_alternativo(cena, cena_convertida, "texto", ("titulo", "headline"))
    _preencher_com_alternativo(
        cena, cena_convertida, "subtexto", ("cta", "botao", "button", "call_to_action")
    )


def _alternativos_do_marco(cena: dict, cena_convertida: dict) -> None:
    # IA pode usar "evento"/"descricao" em vez de "texto"/"contexto"
    _preencher_com_alternativo(cena, cena_convertida, "texto", ("evento", "nome", "title"))
    _preencher_com_alternativo(
        cena, cena_convertida, "subtexto", ("periodo", "data", "periodo_historico")
    )


def _alternativos_da_ficha(cena: dict, cena_convertida: dict) -> None:
    if "nome_curto" not in cena_convertida:
        for alias in ("nome_exibicao", "nomeExibicao", "nome_conhecido", "nomeConhecido"):
            if alias in cena and cena[alias]:
                cena_convertida["nome_curto"] = str(cena[alias])
                break


def _sem_alternativos(cena: dict, cena_convertida: dict) -> None:
    return None


_ALTERNATIVOS_POR_TIPO = {
    "destaque_numerico": _alternativos_do_destaque,
    "fonte_referencia": _alternativos_da_fonte,
    "chamada_final": _alternativos_da_chamada_final,
    "marco_historico": _alternativos_do_marco,
    "ficha_biografica": _alternativos_da_ficha,
}
