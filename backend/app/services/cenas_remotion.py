import asyncio
import json
import logging
import time

from app.database import AsyncSessionLocal
from app.domain.corte_mapper import coalescer_chaves_mascote
from app.domain.manual_prompt import pedir_resposta_json_em_bloco_codigo
from app.domain.time_convert import hms_to_seg
from app.infrastructure import gemini_client
from app.models import Corte
from app.services import retrato_wikipedia
from app.services.app_logging import operational_debug, operational_error, operational_info

logger = logging.getLogger(__name__)

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
    """
    Calibração baseada em densidade — ~2.5 cenas/min, com hook
    obrigatório nos primeiros 15s.

    Regra empírica: canais de cortes virais entregam 1 cena a cada
    ~20-30s. Não confundir com vídeo longo de canal (1 cena/min).
    """
    cenas_por_min = 1.5
    duracao_min = max(0.5, duracao_seg / 60.0)
    max_cenas = int(round(duracao_min * cenas_por_min))

    # Pisos por faixa (evita corte muito curto sem identidade)
    if duracao_seg < 60:
        max_cenas = max(max_cenas, 2)
    elif duracao_seg < 180:
        max_cenas = max(max_cenas, 4)
    else:
        max_cenas = max(max_cenas, 6)

    # Teto absoluto (vídeo de 30min+ nunca passa de 40)
    max_cenas = min(max_cenas, 40)

    return {
        "max_cenas": max_cenas,
        "max_identidade": max(2, max_cenas // 3),
        "max_fullscreen": max(1, max_cenas // 8),
        "min_primeiros_15s": 1 if duracao_seg < 60 else 2,
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




from app.channel_config_loader import PROMPT_DIRECAO

class CenasRemotionService:
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

            operational_debug(
                "CenasRemotion",
                f"Montando prompt para '{corte.titulo_proposto}'. "
                f"Primeiro segmento: {transcricao_final[0].get('start', 0)}s",
            )

            from app.domain.chunker import fatiar_transcricao

            # 1. Primeiro garante a granularidade (evita blocos de texto gigantes)
            # 1. Granulariza a transcrição inteira primeiro e atribui índices globais
            transcricao_granular = CenasRemotionService._get_granular(transcricao_final)

            # 2. Depois fatia em blocos de 15 minutos, com leve sobreposição para contexto
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
                prompt_chunk = cabecalho_parte + PROMPT_DIRECAO.format(
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
                "formato": "vlog_analitico",
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
    async def importar_cenas(corte_id: str, payload: dict) -> dict:
        """Recebe resultado de IA externa, normaliza e salva as cenas."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError(f"Corte '{corte_id}' não encontrado.")

            transcricao_final = json.loads(corte.transcricao_final or "[]")
            if not transcricao_final:
                raise ValueError("Transcrição final vazia.")

        # IMPORTANTE: Granularizar igual ao prompt para os índices baterem
        transcricao_granular = CenasRemotionService._get_granular(transcricao_final)
        cenas_raw = payload if isinstance(payload, list) else payload.get("cenas", [])
        cenas_convertidas = CenasRemotionService._converter_startleg(
            cenas_raw, transcricao_granular
        )
        retratos = await CenasRemotionService._preencher_retratos_cenas(cenas_convertidas)

        resultado = {
            "formato": "vlog_analitico",
            "paleta": {
                "verdeSapo": "#3FA66A",
                "verdeProfundo": "#1F5132",
                "azulLagoa": "#4FA8C9",
                "azulClaro": "#6FBED9",
                "azulProfundo": "#2C6B8A",
                "azulNoite": "#173E55",
                "ouroOlho": "#FFD93D",
                "brancoNeve": "#F5F5F5",
            },
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
            from app.domain.chunker import fatiar_transcricao

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
                        + PROMPT_DIRECAO.format(
                            titulo=corte.titulo_proposto,
                            tema_central=corte.tema_central,
                            resumo=corte.resumo,
                            duracao_estimada=duracao_estimada,
                            legendas_numeradas=legendas_numeradas,
                            max_cenas=limites["max_cenas"],
                            max_identidade=limites["max_identidade"],
                            max_fullscreen=limites["max_fullscreen"],
                            min_primeiros_15s=limites["min_primeiros_15s"] if i == 0 else 0,
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
            retratos = await CenasRemotionService._preencher_retratos_cenas(cenas_convertidas)
            operational_info(
                "CenasRemotion", f"{len(cenas_convertidas)} cenas convertidas com sucesso."
            )

            resultado = {
                "formato": "vlog_analitico",
                "paleta": {
                    "verdeSapo": "#3FA66A",
                    "verdeProfundo": "#1F5132",
                    "azulLagoa": "#4FA8C9",
                    "azulClaro": "#6FBED9",
                    "azulProfundo": "#2C6B8A",
                    "azulNoite": "#173E55",
                    "ouroOlho": "#FFD93D",
                    "brancoNeve": "#F5F5F5",
                },
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
        except Exception as exc:
            logger.warning("Falha ao buscar retrato para '%s': %s", nome, exc)
            return None, True

        if retrato is None:
            return None, False
        return _url_retrato_para_remotion(retrato.url_publica), False

    @staticmethod
    def _get_granular(transcricao: list) -> list:
        """Centraliza a lógica de granularização para garantir que os índices sempre batam."""
        from app.domain.transcricao_utils import (
            dividir_segmentos_longos,
            limpar_e_ordenar_transcricao,
        )

        transcricao_limpa = limpar_e_ordenar_transcricao(transcricao)
        granular = dividir_segmentos_longos(transcricao_limpa, max_duracao=4.0, max_palavras=6)
        for idx, seg in enumerate(granular):
            seg["global_index"] = idx
        return granular

    @staticmethod
    def _montar_legendas_numeradas(transcricao_chunk: list) -> str:
        from app.domain.time_convert import seg_to_hms_short

        # Usa os índices globais já atribuídos na lista original
        linhas = []
        for item in transcricao_chunk:
            texto = item.get("texto", "").strip()
            if not texto:
                continue

            t_start = _to_seg(item.get("start", item.get("inicio", 0)))
            hms = seg_to_hms_short(t_start)
            idx_global = item.get("global_index", 0)
            linhas.append(f"[{idx_global}] ({hms}) {texto}")

        return "\n".join(linhas)

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
        cenas_convertidas = []
        for cena in cenas_ia:
            start_leg = cena.get("startLeg", 0)
            duracao_s = cena.get("duracao_s", 5)
            inicio_seg = CenasRemotionService._resolver_startleg(int(start_leg), transcricao)

            cena_convertida = {
                "tipo": cena.get("tipo", "barra_inferior"),
                "inicio": round(inicio_seg, 2),
                "fim": round(inicio_seg + duracao_s, 2),
            }
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

            # Mascote (D-186): a IA/canais legados podem emitir sapoMood/sapoPosicao/
            # sapoTamanho; a escrita passa a usar as chaves novas mascot*. O coalescer
            # traduz o nome legado para o novo antes de salvar.
            cena_mascote = coalescer_chaves_mascote(cena)
            for campo in ("mascotMood", "mascotPosicao", "mascotTamanho"):
                if cena_mascote.get(campo) is not None:
                    cena_convertida[campo] = cena_mascote[campo]

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

            # Normalizar campos que a IA pode gerar com nomes errados
            tipo = cena_convertida["tipo"]
            if tipo == "destaque_numerico":
                # IA pode enviar numero como string ou usar campo "valor"/"data"
                for alias in ("valor", "data", "stat"):
                    if alias in cena and "numero" not in cena_convertida:
                        try:
                            cena_convertida["numero"] = float(
                                str(cena[alias]).replace(".", "").replace(",", ".")
                            )
                        except Exception:
                            cena_convertida["texto"] = str(cena[alias])
            elif tipo == "fonte_referencia":
                # IA pode usar "referencia" ou "source" em vez de "fonte"
                if "fonte" not in cena_convertida:
                    for alias in ("referencia", "source", "ref"):
                        if alias in cena:
                            cena_convertida["fonte"] = str(cena[alias])
                            break
            elif tipo == "chamada_final":
                # IA pode usar "titulo"/"cta"/"botao" em vez de "texto"/"subtexto"
                if "texto" not in cena_convertida:
                    for alias in ("titulo", "headline"):
                        if alias in cena:
                            cena_convertida["texto"] = str(cena[alias])
                            break
                if "subtexto" not in cena_convertida:
                    for alias in ("cta", "botao", "button", "call_to_action"):
                        if alias in cena:
                            cena_convertida["subtexto"] = str(cena[alias])
                            break
            elif tipo == "marco_historico":
                # IA pode usar "evento"/"descricao" em vez de "texto"/"contexto"
                if "texto" not in cena_convertida:
                    for alias in ("evento", "nome", "title"):
                        if alias in cena:
                            cena_convertida["texto"] = str(cena[alias])
                            break
                if "subtexto" not in cena_convertida:
                    for alias in ("periodo", "data", "periodo_historico"):
                        if alias in cena:
                            cena_convertida["subtexto"] = str(cena[alias])
                            break
            elif tipo == "ficha_biografica" and "nome_curto" not in cena_convertida:
                for alias in ("nome_exibicao", "nomeExibicao", "nome_conhecido", "nomeConhecido"):
                    if alias in cena and cena[alias]:
                        cena_convertida["nome_curto"] = str(cena[alias])
                        break

            for campo in ["marcos", "itens"]:
                valor = cena.get(campo)
                if isinstance(valor, list) and valor:
                    cena_convertida[campo] = valor
            cenas_convertidas.append(cena_convertida)

        # Ordenar sempre por tempo de início crescente
        cenas_convertidas.sort(key=lambda x: x.get("inicio", 0))

        return cenas_convertidas
