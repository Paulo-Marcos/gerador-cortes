"""Serviço de geração via Claude (provider alternativo ao n8n/Gemini).

WHY: dá ao operador um caminho de geração que usa a assinatura local do Claude e a
expertise editorial do canal, SEM substituir os providers atuais. Reaproveita as
costuras que já existem nos serviços de domínio (`AnaliseService.importar_resultado`,
sincronização de transcrição), então a lógica de persistência e o contrato de
dados permanecem únicos.

Fonte editorial (D-144): cada geração nomeia uma skill editorial (`_SKILL_*`). O
conteúdo dessa skill é RESOLVIDO PELO LOADER em `claude_cli_client`: se houver um
override em `instance/editorial/<arquivo>.md` (fonte única, gitignored), ele é
usado; senão, cai no fallback da skill versionada em `.claude/skills/<skill>/`.
Assim qualquer usuário troca os prompts sem editar código, e o comportamento
permanece idêntico quando não há override.

Fase 2 (este arquivo): análise da live → cortes + trechos a remover (desvios),
encadeando automaticamente o "refazer transcrição" ao final.
"""

import json
import logging
import time

from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.chunker import fatiar_transcricao
from app.domain.segment_calculator import normalizar_desvio
from app.domain.time_convert import hms_to_seg, seg_to_hms_short
from app.domain.transcricao_utils import dividir_segmentos_longos, limpar_e_ordenar_transcricao
from app.domain.variacao_prompt import bloco_variacao
from app.editorial_identity import identidade_do_mascote
from app.infrastructure import claude_cli_client
from app.models import Corte, Projeto, StatusProjeto
from app.services.analise import AnaliseService, _to_seg
from sqlalchemy import delete as sa_delete
from sqlalchemy import select as sa_select

logger = logging.getLogger(__name__)


def _carregar_transcricao_raw(raw: str, projeto_id: str) -> list | dict:
    """Faz o parse de `projeto.transcricao_raw` tolerando dado corrompido.

    Um JSON inválido no banco não deve derrubar a análise inteira: loga e cai
    para vazio, deixando o fluxo seguir (e o problema visível no log).
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(
            "[ClaudeIA] transcricao_raw do projeto %s corrompida (JSON inválido); "
            "assumindo vazia.",
            projeto_id,
        )
        return []


# Identificadores das skills editoriais. Funcionam como CHAVE do loader: o
# corpo é resolvido por `claude_cli_client` (instance/editorial/ → .claude/skills/).
_SKILL_CORTES = "cortador-expert"
_SKILL_TRECHOS = "trechos-expert"
_SKILL_CENAS = "cenas-expert"
_SKILL_METADADOS = "metadados-expert"
_SKILL_THUMBNAIL = "thumbnail-prompt-expert"


def _strip_code_fences(texto: str) -> str:
    """Remove cercas ``` de markdown que o modelo às vezes coloca em volta do texto."""
    t = (texto or "").strip()
    if not t.startswith("```"):
        return t
    linhas = t.splitlines()
    if linhas and linhas[0].startswith("```"):
        linhas = linhas[1:]
    if linhas and linhas[-1].strip() == "```":
        linhas = linhas[:-1]
    return "\n".join(linhas).strip()


class ClaudeIaService:
    """Orquestra gerações via Claude, reusando os serviços de domínio."""

    @staticmethod
    async def analisar_via_claude(projeto_id: str, *, encadear_transcricao: bool = True) -> dict:
        """Analisa a transcrição via Claude, substitui os cortes e (opcional)
        encadeia o refazer-transcrição para sincronizar cada corte.

        Replica a semântica do "reanalisar": apaga os cortes existentes e gera
        do zero. A skill `cortador-expert` carrega toda a expertise editorial.
        """
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto or not projeto.transcricao_raw:
                raise ValueError("Projeto não encontrado ou sem transcrição")

            transcricao = _carregar_transcricao_raw(projeto.transcricao_raw, projeto_id)
            meta = {
                "titulo_live": projeto.titulo_live or "",
                "youtube_url": projeto.youtube_url or "",
                "duracao_segundos": projeto.duracao_segundos or 0,
            }
            status_anterior = projeto.status
            projeto.status = StatusProjeto.ANALISANDO
            await db.commit()

        try:
            # Gera PRIMEIRO; só troca os cortes depois de ter o resultado. Assim
            # uma falha (ou reload que mate a task) NUNCA deixa o projeto sem cortes.
            payload = await ClaudeIaService._gerar_cortes(transcricao, meta)
            cortes_data = payload.get("cortes", [])
            descartados = payload.get("descartados", [])
            if not cortes_data:
                raise ValueError("Claude não retornou cortes para a transcrição")

            async with AsyncSessionLocal() as db:
                await db.execute(sa_delete(Corte).where(Corte.projeto_id == projeto_id))
                await db.commit()
            await AnaliseService.importar_resultado(
                projeto_id,
                cortes_data,
                descartados=descartados,
            )

            if encadear_transcricao:
                await ClaudeIaService._refazer_transcricao(projeto_id)

            logger.info(
                "[ClaudeIA] Projeto %s analisado via Claude: %d cortes, %d descartados",
                projeto_id[:8],
                len(cortes_data),
                len(descartados),
            )
            return {"total_cortes": len(cortes_data), "total_descartados": len(descartados)}

        except Exception:  # noqa: BLE001 — restaura status e propaga (endpoint mostra o erro)
            await ClaudeIaService._restaurar_status(projeto_id, status_anterior)
            raise

    # ── geração dos cortes (decide direto vs lote pelo tamanho) ───────────────

    @staticmethod
    async def _gerar_cortes(transcricao: list, meta: dict) -> dict:
        """Gera cortes via Claude. Manda a transcrição inteira de uma vez
        (melhor coerência temática); cai para lote só se exceder o orçamento
        de contexto — decisão baseada em settings.claude_analise_max_chars_direto.

        I-034: retorna `{cortes, descartados}` para que o caller possa persistir
        o audit trail editorial completo da skill cortador-expert.
        """
        segmentos = ClaudeIaService._granularizar(transcricao)
        texto_completo = ClaudeIaService._formatar_segmentos(segmentos)

        if len(texto_completo) <= settings.claude_analise_max_chars_direto:
            logger.info("[ClaudeIA] Análise DIRETA (%d chars)", len(texto_completo))
            prompt = ClaudeIaService._montar_prompt(texto_completo, meta)
            resultado = await claude_cli_client.generate_json(
                prompt, model=settings.claude_model_analise, skill=_SKILL_CORTES
            )
            return {
                "cortes": resultado.get("cortes", []),
                "descartados": resultado.get("descartados", []) or [],
            }

        return await ClaudeIaService._gerar_cortes_em_lote(segmentos, meta, len(texto_completo))

    @staticmethod
    async def _gerar_cortes_em_lote(segmentos: list, meta: dict, total_chars: int) -> dict:
        """Fallback para transcrições muito longas: fatia em janelas e concatena,
        deduplicando cortes que começam quase no mesmo ponto (overlap dos chunks).

        I-034: agrega `descartados` de cada janela, deduplicando por `tema`
        (case-insensitive) para evitar entradas repetidas no overlap.
        """
        chunks = fatiar_transcricao(
            segmentos, chunk_tamanho_seg=2400.0, overlap_seg=300.0, min_last_chunk_seg=1200.0
        )
        logger.warning(
            "[ClaudeIA] Análise em LOTE: %d chars excede o limite direto → %d janelas",
            total_chars,
            len(chunks),
        )

        cortes: list = []
        vistos: set[int] = set()
        descartados: list = []
        temas_vistos: set[str] = set()
        for indice, chunk in enumerate(chunks):
            texto = ClaudeIaService._formatar_segmentos(chunk)
            prompt = ClaudeIaService._montar_prompt(
                texto, meta, cabecalho=f"PARTE {indice + 1} de {len(chunks)} da transcrição."
            )
            resultado = await claude_cli_client.generate_json(
                prompt, model=settings.claude_model_analise, skill=_SKILL_CORTES
            )
            for corte in resultado.get("cortes", []):
                chave = int(_to_seg(corte.get("inicio_seg") or 0) // 30)  # bucket de 30s
                if chave in vistos:
                    continue
                vistos.add(chave)
                cortes.append(corte)
            for desc in resultado.get("descartados", []) or []:
                tema_norm = (desc.get("tema") or "").strip().lower()
                if not tema_norm or tema_norm in temas_vistos:
                    continue
                temas_vistos.add(tema_norm)
                descartados.append(desc)
        return {"cortes": cortes, "descartados": descartados}

    # ── montagem do prompt e da transcrição ───────────────────────────────────

    @staticmethod
    def _montar_prompt(texto_transcricao: str, meta: dict, *, cabecalho: str = "") -> str:
        duracao = int(meta.get("duracao_segundos") or 0)
        cabecalho_section = f"*** {cabecalho} ***\n\n" if cabecalho else ""
        return (
            f"{bloco_variacao('cortes')}\n\n"
            f"{cabecalho_section}"
            "=== DADOS DA LIVE ===\n"
            f"Título: {meta.get('titulo_live', '')}\n"
            f"Duração: {duracao // 3600}h{(duracao % 3600) // 60}m\n"
            f"URL: {meta.get('youtube_url', '')}\n\n"
            "=== TRANSCRIÇÃO (índice global, timestamp, fala) ===\n"
            f"{texto_transcricao}\n"
            "=== FIM DA TRANSCRIÇÃO ===\n\n"
            "Gere agora a lista de cortes em JSON puro, seguindo exatamente o "
            "formato e as regras da sua expertise acima."
        )

    @staticmethod
    def _granularizar(transcricao: list) -> list:
        """Limpa, ordena e granulariza a transcrição, atribuindo índices globais.
        Mesma preparação usada por AnaliseService.montar_prompt (mantém o contrato).
        """
        limpa = limpar_e_ordenar_transcricao(transcricao)
        granular = dividir_segmentos_longos(limpa, max_duracao=4.0, max_palavras=6)
        for indice, seg in enumerate(granular):
            seg["global_index"] = indice
        return granular

    @staticmethod
    def _formatar_segmentos(segmentos: list) -> str:
        linhas = []
        for seg in segmentos:
            inicio = seg.get("inicio", seg.get("start", 0))
            texto = seg.get("texto", seg.get("text", "")).strip()
            if texto:
                idx = seg.get("global_index", 0)
                linhas.append(f"[{idx}] ({seg_to_hms_short(_to_seg(inicio))}) {texto}")
        return "\n".join(linhas)

    # ── encadeamento do "refazer transcrição" ─────────────────────────────────

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

    # ── Fase 2b: regerar trechos a remover (desvios) de UM corte ──────────────

    @staticmethod
    async def gerar_trechos_via_claude(corte_id: str) -> dict:
        """Regenera os trechos a remover (desvios) de um corte via Claude e
        ressincroniza a transcrição final. Usa a skill `trechos-expert`.

        Para quando o usuário precisa refazer só os cortes de remoção de um
        corte específico, sem reanalisar a live inteira.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")
            if not corte.transcricao_corte:
                raise ValueError("Corte sem transcrição bruta. Rode 'refazer transcrição' antes.")
            transcricao_bruta = json.loads(corte.transcricao_corte)
            meta = {
                "titulo": corte.titulo_proposto or "",
                "tema_central": corte.tema_central or "",
                "inicio_hms": corte.inicio_hms or "",
                "fim_hms": corte.fim_hms or "",
            }
            # WHY: este botão SÓ ACRESCENTA trechos — nunca remove os existentes.
            desvios_existentes = [normalizar_desvio(d) for d in json.loads(corte.desvios or "[]")]

        desvios_novos = await ClaudeIaService._gerar_desvios(
            transcricao_bruta, meta, desvios_existentes
        )
        # WHY: origem='claude' permite o frontend exibir o badge correto
        # (Bug-2 do I-020). normalizar_desvio preserva campos extras via dict(d).
        normalizados_novos = [normalizar_desvio({**d, "origem": "claude"}) for d in desvios_novos]
        mesclados, adicionados = ClaudeIaService._mesclar_desvios(
            desvios_existentes, normalizados_novos
        )

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")
            corte.desvios = json.dumps(mesclados, ensure_ascii=False)
            await db.commit()

        # Ressincroniza a transcrição final aplicando o conjunto de desvios.
        from app.services.corte import CorteService

        await CorteService.sincronizar_transcricao_corte(corte_id)

        logger.info(
            "[ClaudeIA] Trechos via Claude p/ corte %s: +%d novos (total %d)",
            corte_id[:8],
            adicionados,
            len(mesclados),
        )
        return {"total_desvios": len(mesclados), "novos": adicionados}

    @staticmethod
    def _mesclar_desvios(existentes: list, novos: list) -> tuple[list, int]:
        """Acrescenta `novos` aos `existentes` SEM remover nenhum existente.

        Pula um novo desvio que praticamente coincide com um já marcado
        (mesma janela arredondada de 2s), evitando duplicatas exatas.
        Retorna (lista_mesclada, quantidade_adicionada).
        """

        def _chave(d: dict) -> tuple[int, int]:
            return (
                round(_to_seg(d.get("inicio_seg") or 0) / 2),
                round(_to_seg(d.get("fim_seg") or 0) / 2),
            )

        vistos = {_chave(d) for d in existentes}
        mesclados = list(existentes)
        adicionados = 0
        for d in novos:
            chave = _chave(d)
            if chave in vistos:
                continue
            vistos.add(chave)
            mesclados.append(d)
            adicionados += 1
        return mesclados, adicionados

    @staticmethod
    async def _gerar_desvios(transcricao_bruta: list, meta: dict, existentes: list) -> list:
        # WHY: o prompt antigo (minimalista) sub-extraía desvios (~3 por corte longo).
        # Reaproveitamos o pipeline rico do fluxo "manual IA": limpamos+granularizamos
        # a transcrição, chunkificamos em partes (~40min com 5min de overlap) e mandamos
        # cada chunk com regras explícitas. Empata em qualidade com PROMPT_ANALISAR_DESVIOS
        # mas pede saída com a chave `desvios` (compatível com a skill trechos-expert).
        transcricao_limpa = limpar_e_ordenar_transcricao(transcricao_bruta)
        transcricao_granular = dividir_segmentos_longos(
            transcricao_limpa, max_duracao=4.0, max_palavras=6
        )
        chunks = fatiar_transcricao(
            transcricao_granular,
            chunk_tamanho_seg=2400.0,
            overlap_seg=300.0,
            min_last_chunk_seg=1200.0,
        )

        cabecalho_meta = ClaudeIaService._cabecalho_meta_corte(meta, existentes)

        novos: list = []
        for indice, chunk in enumerate(chunks):
            texto_chunk = ClaudeIaService._formatar_chunk_para_prompt(chunk)
            prompt = ClaudeIaService._montar_prompt_trechos(
                texto_chunk, cabecalho_meta, indice + 1, len(chunks)
            )
            t = time.perf_counter()
            resultado = await claude_cli_client.generate_json(
                prompt, model=settings.claude_model_analise, skill=_SKILL_TRECHOS
            )
            # WHY: a skill trechos-expert pede `desvios`; o prompt rico pode também
            # devolver `trechos` (chave do fluxo manual). Aceitamos ambos.
            chunk_desvios = resultado.get("desvios") or resultado.get("trechos") or []
            novos.extend(chunk_desvios)
            logger.info(
                "[ClaudeIA/trechos] chunk %d/%d: %d trechos em %.1fs",
                indice + 1,
                len(chunks),
                len(chunk_desvios),
                time.perf_counter() - t,
            )

        return novos

    @staticmethod
    def _cabecalho_meta_corte(meta: dict, existentes: list) -> str:
        """Bloco de contexto editorial do corte — repetido em cada chunk para
        evitar que a IA confunda desvio com tese central."""
        ja_marcados = ""
        if existentes:
            linhas = "\n".join(
                f"- {d.get('inicio_hms', '')} → {d.get('fim_hms', '')} ({d.get('motivo', '')})"
                for d in existentes
            )
            ja_marcados = (
                "\n=== TRECHOS JÁ MARCADOS (NÃO repita estes; proponha APENAS NOVOS) ===\n"
                f"{linhas}\n"
            )
        return (
            "=== CORTE EM REVISÃO ===\n"
            f"Título: {meta.get('titulo', '')}\n"
            f"Tema central: {meta.get('tema_central', '')}\n"
            f"Intervalo do corte: {meta.get('inicio_hms', '')} → {meta.get('fim_hms', '')}\n"
            f"{ja_marcados}"
        )

    @staticmethod
    def _formatar_chunk_para_prompt(chunk: list) -> str:
        linhas = []
        for item in chunk:
            inicio = item.get("start", item.get("inicio", 0))
            texto = str(item.get("texto", item.get("text", ""))).strip()
            if texto:
                linhas.append(f"({seg_to_hms_short(float(inicio))}) {texto}")
        return "\n".join(linhas)

    @staticmethod
    def _montar_prompt_trechos(
        texto_transcricao: str, cabecalho_meta: str, parte: int, total_partes: int
    ) -> str:
        # WHY: regras detalhadas (adaptadas de PROMPT_ANALISAR_DESVIOS em desvios.py)
        # eram o que faltava — sem isso a IA sub-extraía. Inclui tipos explícitos
        # (DESVIO/REPETICAO), exemplos concretos e formato JSON com a chave
        # `desvios` para casar com a skill trechos-expert.
        cabecalho_parte = (
            f"*** ATENÇÃO: Esta é a PARTE {parte} de {total_partes} do corte. "
            f"Identifique os trechos a remover APENAS para esta parte. ***\n\n"
            if total_partes > 1
            else ""
        )
        return (
            f"{cabecalho_parte}"
            f"{cabecalho_meta}\n"
            "Você é um editor de vídeo especialista. Receberá um trecho da transcrição "
            "de um corte e deve identificar partes que podem ser removidas sem comprometer "
            "o entendimento da tese central:\n\n"
            "1. **DESVIO** — Trecho que foge do tema: digressões, avisos técnicos, problemas "
            "de transmissão, interação irrelevante com o chat (pedir like/inscrição sem dizer "
            "qual canal, ler comentário fora do tema, cumprimentar viewers), tangentes administrativas, "
            "silêncios longos, conteúdo fora do tom.\n"
            "2. **REPETICAO** — Trecho onde o locutor reitera ideia já explicada sem agregar "
            "ângulo novo. Marque apenas redundâncias reais, não transições naturais de raciocínio.\n\n"
            "A transcrição abaixo usa tempos ABSOLUTOS do vídeo original. Os timestamps de início "
            "e fim que você retornar devem ser desses mesmos tempos absolutos, dentro do intervalo "
            "do corte.\n\n"
            "=== TRANSCRIÇÃO (timestamp absoluto — fala) ===\n"
            f"{texto_transcricao}\n"
            "=== FIM DA TRANSCRIÇÃO ===\n\n"
            "Retorne APENAS o JSON, sem explicações. Formato esperado:\n"
            "{\n"
            '  "desvios": [\n'
            "    {\n"
            '      "inicio_hms": "HH:MM:SS",\n'
            '      "fim_hms": "HH:MM:SS",\n'
            '      "tipo": "DESVIO" | "REPETICAO",\n'
            '      "motivo": "Descrição breve do motivo"\n'
            "    }\n"
            "  ]\n"
            "}\n\n"
            "Regras importantes:\n"
            "- Seja conservador: só remova o que claramente não agrega à tese central.\n"
            "- Encontre TODOS os desvios óbvios — não pare em 2-3. Pedir like/inscrição "
            "sem qualificar o canal, comentários administrativos longos e digressões claras "
            "DEVEM ser marcados.\n"
            "- Para REPETICAO: só marque se a ideia já foi explicada antes e a repetição "
            "não traz nada novo.\n"
            "- Não remova transições naturais de raciocínio, apenas redundâncias reais.\n"
            "- Os timestamps devem estar dentro do intervalo desta parte da transcrição.\n"
            '- Se realmente não houver nada a remover, retorne {"desvios": []}.\n'
        )

    # ── Fase 3: cenas e metadados via Claude (incremental ou em paralelo) ─────

    @staticmethod
    async def gerar_cenas_via_claude(corte_id: str) -> dict:
        """Gera as cenas Remotion de um corte via Claude (skill cenas-expert).

        Reaproveita o prompt detalhado (que carrega o schema) e o importador de
        cenas já existentes. Se o corte for longo, o prompt vem particionado —
        geramos por parte e concatenamos as cenas antes de importar.
        """
        from app.services.cenas_remotion import CenasRemotionService

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

        variacao = bloco_variacao("cenas")  # uma lente por geração (consistente entre as partes)
        cenas: list = []
        for indice, parte in enumerate(prompts):
            prompt = f"{variacao}\n\n{parte['texto']}"
            t = time.perf_counter()
            resultado = await claude_cli_client.generate_json(
                prompt, model=settings.claude_model_cenas, skill=_SKILL_CENAS
            )
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
    async def gerar_metadados_via_claude(corte_id: str) -> dict:
        """Gera metadados do corte via Claude usando contexto puro + skill.

        WHY: a expertise editorial (regras de título, lista negra, famílias,
        checklist) vive inteira em `.claude/skills/metadados-expert/SKILL.md`.
        O service só fornece o input do corte — espelho do fluxo da thumbnail.
        """
        from app.services.metadados import MetadadosService

        ctx = await MetadadosService.montar_contexto_meta(corte_id)
        prompt = (
            f"{bloco_variacao('metadados')}\n\n"
            "=== INPUT DO CORTE ===\n"
            f"titulo_proposto: {ctx['titulo_proposto']}\n"
            f"tema_central: {ctx['tema']}\n"
            f"numero_corte: {ctx['numero_corte']}\n"
            f"resumo_historico (pode estar desatualizado — em caso de conflito, "
            f"a transcrição prevalece): {ctx['resumo']}\n\n"
            "=== TRANSCRIÇÃO FINAL DO CORTE (fonte primária de verdade) ===\n"
            f"{ctx['transcricao']}\n\n"
            "=== TÍTULOS RECENTES DA SÉRIE (evite repetir estrutura/tom) ===\n"
            f"{ctx['historico_titulos']}\n\n"
            "Gere os metadados seguindo TODAS as regras da skill metadados-expert "
            "(STEP 0 → checklist final) e devolva APENAS o JSON no formato "
            "exigido pela seção OUTPUT da skill."
        )
        resultado = await claude_cli_client.generate_json(
            prompt, model=settings.claude_model_metadados, skill=_SKILL_METADADOS
        )
        await MetadadosService.importar_resultado_meta(corte_id, resultado)
        logger.info("[ClaudeIA] Metadados gerados via Claude p/ corte %s", corte_id[:8])
        return {"ok": True}

    @staticmethod
    async def gerar_resumo_via_claude(corte_id: str) -> dict:
        """Regenera o resumo (arco de raciocínio) de UM corte via Claude.

        Reaproveita a sub-transcrição do período do corte (mesma janela que o
        fluxo anterior usava) e pede ao Claude um resumo maduro, sem clickbait.
        Persiste em `corte.resumo` e devolve `{resumo, status}` (contrato que o
        router de cortes consome).
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado.")
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto or not projeto.transcricao_raw:
                raise ValueError("Projeto não possui transcrição base para análise.")
            transcricao_dados = _carregar_transcricao_raw(
                projeto.transcricao_raw, corte.projeto_id
            )
            inicio_seg = float(corte.inicio_seg)
            fim_seg = float(corte.fim_seg)
            titulo = corte.titulo_proposto or ""
            tema = corte.tema_central or ""
            resumo_antigo = corte.resumo or ""
            inicio_hms = corte.inicio_hms
            fim_hms = corte.fim_hms

        # Filtra as falas do período (margem de 5s nas bordas).
        textos: list[str] = []
        for t in transcricao_dados:
            try:
                segundos = hms_to_seg(t.get("inicio", "00:00:00.000"))
            except Exception:  # noqa: BLE001 — segmento malformado, ignora
                continue
            if inicio_seg - 5 <= segundos <= fim_seg + 5:
                textos.append(t.get("texto", ""))

        transcricao_filtrada = " ".join(textos)
        if not transcricao_filtrada:
            raise ValueError(
                f"O período do corte ({inicio_hms} a {fim_hms}) caiu em silêncio "
                "absoluto na transcrição original."
            )

        prompt = (
            f"{bloco_variacao('metadados')}\n\n"
            "Você é um editor de vídeo-ensaio analítico. Reescreva o RESUMO de um "
            "corte com base na transcrição abaixo. O resumo deve, em 2-3 frases, "
            "descrever o ARCO DE RACIOCÍNIO (tese → desenvolvimento → conclusão), "
            "com tom maduro, honesto e sem clickbait.\n\n"
            f"=== DADOS DO CORTE ===\n"
            f"titulo_proposto: {titulo}\n"
            f"tema_central: {tema}\n"
            f"resumo_antigo (pode estar desatualizado): {resumo_antigo}\n\n"
            "=== TRANSCRIÇÃO DO CORTE (fonte primária de verdade) ===\n"
            f"{transcricao_filtrada}\n\n"
            'Retorne APENAS o JSON no formato: {"resumo": "..."}'
        )
        resultado = await claude_cli_client.generate_json(
            prompt, model=settings.claude_model_metadados
        )
        novo_resumo = resultado.get("resumo")
        if not novo_resumo:
            raise ValueError("Claude não retornou a key 'resumo'.")

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado.")
            corte.resumo = novo_resumo
            await db.commit()

        logger.info("[ClaudeIA] Resumo regerado via Claude p/ corte %s", corte_id[:8])
        return {"resumo": novo_resumo, "status": "sucesso"}

    # ── Fase 4: prompt de thumbnail via Claude (skill capista) ────────────────

    @staticmethod
    async def gerar_prompt_thumbnail_via_claude(corte_id: str) -> dict:
        """Gera o prompt de imagem da thumbnail via Claude (skill
        thumbnail-prompt-expert), reusando o builder e o importador existentes.

        Salva o campo `prompt_thumbnail` (string) que o gerador de imagem consome.
        """
        from app.services.metadados import (
            MetadadosService,
            formatar_bloco_hints_thumbnail,
        )

        ctx = await MetadadosService.montar_contexto_thumbnail(corte_id)
        # E-010: nome do mascote vem do instance/editorial (fallback neutro),
        # não mais embutido no código — a saída do canal atual é preservada
        # porque o instance/ fornece nome="Sapo".
        mascote = identidade_do_mascote().nome
        # F-058: direção manual do editor, anexada ao prompt como prioridade.
        bloco_hints = formatar_bloco_hints_thumbnail(ctx.get("hints"))
        emojis_obrigatorios = []
        if ctx.get("is_fire"):
            emojis_obrigatorios.append("🔥")
        if ctx.get("is_leitura"):
            emojis_obrigatorios.append("📖")
        marca_emojis = (
            f"EMOJIS EDITORIAIS OBRIGATÓRIOS NA ARTE: {' '.join(emojis_obrigatorios)} "
            "— este corte foi classificado pelo editor com esta(s) marca(s). "
            "Os emojis 🔥/📖 DEVEM aparecer NA ARTE da thumbnail, mas SEMPRE como "
            "elemento TIPOGRÁFICO/GRÁFICO ao lado do texto do APOIO (mesmo "
            "lockup), NUNCA como elemento da cena (NÃO desenhe chama subindo do "
            f"ombro do {mascote}, NÃO ponha o livro como objeto na mesa). "
            "Pode ser o próprio emoji Unicode renderizado, ou um ícone "
            "estilizado simples (chama / livro) no mesmo peso/estilo da "
            "tipografia do apoio, em tamanho ≥40% da altura da letra do APOIO. "
            "🔥 = TOP do canal; 📖 = série de Leitura."
            if emojis_obrigatorios
            else "EMOJIS EDITORIAIS: nenhum (corte não é TOP nem Leitura — não invente emojis decorativos)."
        )
        prompt = ClaudeIaService._montar_prompt_thumbnail(ctx, marca_emojis, bloco_hints, mascote)
        texto = await claude_cli_client.generate_text(
            prompt,
            model=settings.claude_model_thumbnail,
            skill=_SKILL_THUMBNAIL,
            thinking_tokens=settings.claude_cli_thinking_tokens_thumbnail,
        )
        prompt_thumbnail = _strip_code_fences(texto)
        if not prompt_thumbnail:
            raise ValueError("Claude não retornou o prompt de thumbnail.")

        await MetadadosService.importar_prompt_thumbnail(corte_id, prompt_thumbnail)
        logger.info("[ClaudeIA] Prompt de thumbnail gerado via Claude p/ corte %s", corte_id[:8])
        return {"ok": True}

    @staticmethod
    def _montar_prompt_thumbnail(
        ctx: dict, marca_emojis: str, bloco_hints: str, mascote: str
    ) -> str:
        # WHY: o método editorial completo vive na skill thumbnail-prompt-expert;
        # aqui montamos só o contexto do corte + o resumo das regras não-negociáveis.
        # Extraído da orquestração (D-080) para espelhar _montar_prompt/_montar_prompt_trechos.
        return (
            "=== INPUT DO CORTE ===\n"
            f"tema_central: {ctx['tema']}\n"
            f"titulo_youtube: {ctx['titulo_youtube']}\n"
            f"texto_capa_sugerido: {ctx['texto_capa']}\n"
            f"resumo: {ctx['resumo']}\n"
            f"{marca_emojis}\n"
            f"{bloco_hints}\n"
            "=== TRANSCRIÇÃO FINAL DO CORTE ===\n"
            f"{ctx['transcricao']}\n\n"
            "=== ELEMENTOS PROIBIDOS — últimas capas do canal (NÃO REPITA nem use similar) ===\n"
            f"{ctx['historico_visual']}\n\n"
            "=== DIREÇÃO NÃO-NEGOCIÁVEL DESTA CAPA ===\n"
            "O método completo vive na skill thumbnail-prompt-expert; isto é só o "
            "resumo do que NÃO pode falhar:\n"
            "1) CENÁRIO derivado do contexto REAL do corte (lugar/instituição/"
            "época/cultura citados ou implicados). Nunca cenário neutro/seguro "
            "(lousa, biblioteca genérica, mesa+livro+luminária, fundo escuro "
            "vazio).\n"
            "2) ELENCO: pessoas reconhecíveis relevantes aparecem sempre que "
            f"possível; {mascote} sozinho é fallback, não default. Múltiplas figuras "
            "permitidas com hierarquia clara; descreva cada pessoa real com "
            "fidelidade (idade, cabelo/calvície, barba, óculos, traços, roupa "
            "pública).\n"
            "3) ROUPA: registro relaxado/casual derivado do contexto — o "
            "contraste tema-sério × roupa-informal é da marca. NÃO repita o "
            "registro de roupa das últimas capas; default bege/clara/branca/"
            "linho PROIBIDO. Descreva a roupa exata SÓ no prompt final; nunca "
            "'adult relaxed clothing'.\n"
            "4) LUZ: escolha uma chave de luz/registro tonal e VARIE-A em "
            "relação às últimas capas — não escureça por reflexo, sem penumbra "
            "cinematográfica por default.\n"
            "5) TEXTO: MANCHETE = o titulo_youtube POR INTEIRO — preserve TODO "
            "o conteúdo essencial (sujeito, nomes citados, conceito-chave, ideia "
            "completa). PROIBIDO cortar para 2-6 palavras ou virar fragmento; "
            "compressão só de conectores ('de/que/na/para'), nunca de termos "
            "centrais. Título longo → manchete em 2-3 linhas, legibilidade pela "
            "composição, nunca apagando palavras. Apoio (texto_capa literal até "
            "5 palavras) é camada SEPARADA — acompanha a manchete, não carrega o "
            "resto do título. Tudo como UM sistema gráfico overlay; peso "
            "BLACK/HEAVY, contorno+sombra, alto contraste. Emoji 🔥/📖 só junto "
            "ao apoio, nunca objeto da cena. Sem retângulo sólido nos 15% "
            "inferiores. Anti-slide (sem lista de tópicos, cards ou tags).\n"
            "6) Antes de escrever, gere 3 hipóteses internas e descarte as que "
            "repetem 3+ eixos das últimas capas; nos EIXOS SATURADOS sinalizados "
            "acima, vá ao POLO OPOSTO.\n\n"
            "=== SAÍDA (siga TODAS as regras da skill thumbnail-prompt-expert) ===\n"
            '1ª linha, exatamente: [VARIATION_TAGS] cenario="..." | '
            'personagens="..." | relacao_mascote_personagens="..." | '
            'escala_mascote="..." | camera="..." | pose="..." | paleta="..." '
            '| luminosidade="..." | tipografia="..." | roupa="..." | '
            'layout_texto="..." | apoio_layout="..."  — frases curtas e '
            "CONCRETAS descrevendo a solução escolhida, sem listar opções.\n"
            "Depois, UMA linha em branco e o prompt final em inglês (formato "
            "PROMPT-MODELO da skill), apenas com a solução escolhida. Sem JSON, "
            "sem markdown, sem comentários, sem 'ou'/alternativas/listas de "
            "proibições."
        )

    @staticmethod
    async def _restaurar_status(projeto_id: str, status) -> None:
        """Restaura o status anterior do projeto (usado quando a análise falha,
        para não deixar o projeto preso em ANALISANDO nem perder os cortes)."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.status = status
                await db.commit()
