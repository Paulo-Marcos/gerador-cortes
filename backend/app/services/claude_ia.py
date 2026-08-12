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

import hashlib
import json
import logging
import time
from datetime import datetime

from app import editorial_scaffolds, editorial_skills
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.ancora_match import ancorar_intervalo
from app.domain.chunker import fatiar_transcricao
from app.domain.desvio_categoria import classificar_desvio
from app.domain.diarizacao_align import alinhar_falantes, prefixo_falante
from app.domain.segment_calculator import normalizar_desvio
from app.domain.snap_desvios import achatar_palavras, snap_desvio_a_palavras
from app.domain.time_convert import hms_to_seg, seg_to_hms, seg_to_hms_short
from app.domain.transcricao_utils import (
    dividir_segmentos_longos,
    limpar_e_ordenar_transcricao,
    motivo_transcricao_inutilizavel,
)
from app.domain.variacao_prompt import bloco_variacao_de
from app.editorial_identity import identidade_do_mascote
from app.infrastructure import claude_cli_client, fila_ia
from app.models import Corte, Projeto, StatusProjeto
from app.services.analise import AnaliseService, _to_seg
from sqlalchemy import select as sa_select

logger = logging.getLogger(__name__)


def _sha1_curto(texto: str) -> str:
    """SHA1 (8 primeiros hex) de um texto — impressão digital estável e curta."""
    return hashlib.sha1((texto or "").encode("utf-8")).hexdigest()[:8]


def _log_skill_usada(
    skill_key: str,
    skill: editorial_skills.SkillResolvida,
    scaffold_texto: str | None = None,
) -> None:
    """Loga a impressão digital da skill resolvida ANTES da chamada ao cliente (D-331).

    WHY: o log do `claude_cli_client` só mostra modelo/tamanho/thinking, não QUAL
    corpo/scaffold/versão de skill entrou — então não dava para confirmar por log se
    a geração rodou a skill nova ou a antiga. Esta linha imprime o sha1 do corpo (e
    do scaffold, quando a etapa monta um) para tornar a skill efetivamente usada
    auditável com um `grep "[ClaudeIA/skill]"`.
    """
    corpo = skill.corpo or ""
    corpo_strip = corpo.strip()
    primeira_linha = corpo_strip.splitlines()[0] if corpo_strip else ""
    scaffold_frag = (
        f" scaffold_sha={_sha1_curto(scaffold_texto)}" if scaffold_texto is not None else ""
    )
    logger.info(
        '[ClaudeIA/skill] etapa=%s modelo=%s thinking=%s corpo=%dch sha=%s "%s"%s',
        skill_key,
        skill.modelo,
        skill.thinking_tokens,
        len(corpo),
        _sha1_curto(corpo),
        primeira_linha,
        scaffold_frag,
    )


def _carregar_transcricao_raw(raw: str, projeto_id: str) -> list | dict:
    """Faz o parse de `projeto.transcricao_raw` tolerando dado corrompido.

    Um JSON inválido no banco não deve derrubar a análise inteira: loga e cai
    para vazio, deixando o fluxo seguir (e o problema visível no log).
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning(
            "[ClaudeIA] transcricao_raw do projeto %s corrompida (JSON inválido); assumindo vazia.",
            projeto_id,
        )
        return []


# Identificadores das skills editoriais. Funcionam como CHAVE do serviço
# `editorial_skills`, que resolve por canal (E-021) o CORPO, as LENTES e os PARAMS
# (modelo/thinking/timeout) — antes espalhados entre `.md`, `_LENTES` e `config`.
_SKILL_CORTES = "cortador-expert"
_SKILL_TRECHOS = "trechos-expert"
_SKILL_CENAS = "cenas-expert"
_SKILL_METADADOS = "metadados-expert"
_SKILL_THUMBNAIL = "thumbnail-prompt-expert"
_SKILL_AVALIACAO = "avaliador-bruto"

# A mensagem cabe num toast; o texto integral do descarte fica na auditoria.
_LIMITE_MOTIVO_NA_TELA = 400


def _args_claude(
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
) -> dict:
    """kwargs comuns do `claude_cli_client` a partir da skill resolvida (E-021).

    `expertise` (corpo do banco) é a fonte da verdade; `skill` fica como FALLBACK
    nativo (`/<skill>`) caso o corpo venha vazio — preservando a semântica anterior.

    D-353: injeta o `contexto` (etapa=skill_key + projeto/corte) para a telemetria
    de chamadas de IA. `None` é aceitável — grava o que houver.
    """
    return {
        "model": skill.modelo,
        "skill": skill_key,
        "expertise": skill.corpo,
        "timeout": skill.timeout,
        "thinking_tokens": skill.thinking_tokens,
        "contexto": claude_cli_client.LlmCallContext(
            etapa=skill_key, projeto_id=projeto_id, corte_id=corte_id
        ),
    }


def _mapa_falantes_para_meta(raw: str) -> dict | None:
    """Parse tolerante do `falantes_map` para injetar na meta da análise (D-286).

    Retorna `None` (sem rótulo) quando o projeto não foi diarizado ou o JSON é
    inválido — o formatador então gera o prompt idêntico ao comportamento antigo.
    """
    if not raw or not isinstance(raw, str):
        return None
    try:
        mapa = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return mapa if isinstance(mapa, dict) and mapa else None


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
    async def analisar_via_claude(
        projeto_id: str, *, encadear_transcricao: bool = True, usar_diarizacao: bool = True
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
                "falantes_map": _mapa_falantes_para_meta(projeto.falantes_map)
                if usar_diarizacao
                else None,
            }
            status_anterior = projeto.status
            projeto.status = StatusProjeto.ANALISANDO
            await db.commit()

        try:
            # Gera PRIMEIRO; só persiste depois de ter o resultado. Assim uma
            # falha (ou reload que mate a task) NUNCA deixa o projeto sem cortes.
            payload = await ClaudeIaService._gerar_cortes(transcricao, meta)
            cortes_data = payload.get("cortes", [])
            descartados = payload.get("descartados", [])
            if not cortes_data:
                raise ValueError(ClaudeIaService._motivo_de_zero_cortes(descartados))

            # Modo aditivo (D-298): lê os cortes e a auditoria que já existem
            # para pular quase-duplicatas e mesclar os descartados — sem apagar.
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    sa_select(Corte.inicio_seg).where(Corte.projeto_id == projeto_id)
                )
                buckets_existentes = {ClaudeIaService._bucket_30s(row[0]) for row in result.all()}
                projeto = await db.get(Projeto, projeto_id)
                descartados_anteriores = (
                    json.loads(projeto.descartados_analise or "[]") if projeto else []
                )

            cortes_novos, pulados = ClaudeIaService._filtrar_cortes_em_buckets(
                cortes_data, buckets_existentes
            )
            descartados_mesclados = ClaudeIaService._mesclar_descartados(
                descartados_anteriores, descartados
            )

            # importar_resultado numera a partir do maior número já usado, então
            # os cortes existentes ficam preservados e os novos seguem a sequência.
            await AnaliseService.importar_resultado(
                projeto_id,
                cortes_novos,
                descartados=descartados_mesclados,
            )

            if encadear_transcricao:
                await ClaudeIaService._refazer_transcricao(projeto_id)

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
            await ClaudeIaService._restaurar_status(projeto_id, status_anterior)
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

    # ── modo aditivo: dedup por bucket de 30s + merge de descartados (D-298) ──

    @staticmethod
    def _bucket_30s(inicio_seg) -> int:
        """Bucket de 30s do início — mesma granularidade que o modo lote usa
        para tratar cortes que começam quase no mesmo ponto como duplicados."""
        return int(_to_seg(inicio_seg or 0) // 30)

    @staticmethod
    def _filtrar_cortes_em_buckets(cortes: list, buckets_existentes: set[int]) -> tuple[list, int]:
        """Descarta os cortes cujo início cai no bucket de 30s de um corte JÁ
        EXISTENTE do projeto (evita inundar a live com quase-duplicatas numa
        reanálise). Retorna (cortes_a_importar, quantidade_pulada)."""
        novos: list = []
        pulados = 0
        for corte in cortes:
            if ClaudeIaService._bucket_30s(corte.get("inicio_seg")) in buckets_existentes:
                pulados += 1
                continue
            novos.append(corte)
        return novos, pulados

    @staticmethod
    def _mesclar_descartados(existentes: list, novos: list) -> list:
        """Acrescenta `novos` aos `existentes` deduplicando por `tema`
        (case-insensitive); preserva todos os existentes e ignora entradas de
        tema vazio (ruído sem chave de dedup). Mesma regra que o modo lote usa
        entre as janelas da mesma geração."""
        mesclados = list(existentes)
        temas_vistos = {
            (d.get("tema") or "").strip().lower()
            for d in existentes
            if (d.get("tema") or "").strip()
        }
        for desc in novos or []:
            tema_norm = (desc.get("tema") or "").strip().lower()
            if not tema_norm or tema_norm in temas_vistos:
                continue
            temas_vistos.add(tema_norm)
            mesclados.append(desc)
        return mesclados

    # ── geração dos cortes (decide direto vs lote pelo tamanho) ───────────────

    @staticmethod
    async def _gerar_cortes(transcricao: list, meta: dict) -> dict:
        """Gera cortes via Claude. Manda a transcrição inteira de uma vez
        (melhor coerência temática); cai para lote só se exceder o orçamento
        de contexto — decisão baseada em settings.claude_analise_max_chars_direto.

        I-034: retorna `{cortes, descartados}` para que o caller possa persistir
        o audit trail editorial completo da skill cortador-expert.
        """
        skill = editorial_skills.resolver_skill(_SKILL_CORTES)
        mapa_falantes = meta.get("falantes_map") or None
        segmentos = ClaudeIaService._granularizar(transcricao)
        texto_completo = ClaudeIaService._formatar_segmentos(segmentos, mapa_falantes)

        if len(texto_completo) <= settings.claude_analise_max_chars_direto:
            logger.info("[ClaudeIA] Análise DIRETA (%d chars)", len(texto_completo))
            prompt = ClaudeIaService._montar_prompt(
                texto_completo, meta, variacao=bloco_variacao_de(skill.lentes)
            )
            _log_skill_usada(_SKILL_CORTES, skill, editorial_scaffolds.resolver_scaffold("cortes"))
            resultado = await claude_cli_client.generate_json(
                prompt, **_args_claude(skill, _SKILL_CORTES, projeto_id=meta.get("projeto_id"))
            )
            return {
                "cortes": resultado.get("cortes", []),
                "descartados": resultado.get("descartados", []) or [],
            }

        return await ClaudeIaService._gerar_cortes_em_lote(
            segmentos, meta, len(texto_completo), skill, mapa_falantes
        )

    @staticmethod
    async def _gerar_cortes_em_lote(
        segmentos: list,
        meta: dict,
        total_chars: int,
        skill: editorial_skills.SkillResolvida,
        mapa_falantes: dict | None = None,
    ) -> dict:
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

        # Uma lente por geração (consistente entre as partes da mesma live),
        # como o fluxo de cenas — nunca uma nova por chunk (titulação
        # inconsistente entre partes da mesma análise).
        variacao = bloco_variacao_de(skill.lentes)
        _log_skill_usada(_SKILL_CORTES, skill, editorial_scaffolds.resolver_scaffold("cortes"))
        cortes: list = []
        vistos: set[int] = set()
        descartados: list = []
        for indice, chunk in enumerate(chunks):
            texto = ClaudeIaService._formatar_segmentos(chunk, mapa_falantes)
            prompt = ClaudeIaService._montar_prompt(
                texto,
                meta,
                cabecalho=f"PARTE {indice + 1} de {len(chunks)} da transcrição.",
                variacao=variacao,
            )
            resultado = await claude_cli_client.generate_json(
                prompt, **_args_claude(skill, _SKILL_CORTES, projeto_id=meta.get("projeto_id"))
            )
            for corte in resultado.get("cortes", []):
                chave = ClaudeIaService._bucket_30s(corte.get("inicio_seg"))
                if chave in vistos:
                    continue
                vistos.add(chave)
                cortes.append(corte)
            descartados = ClaudeIaService._mesclar_descartados(
                descartados, resultado.get("descartados")
            )
        return {"cortes": cortes, "descartados": descartados}

    # ── montagem do prompt e da transcrição ───────────────────────────────────

    @staticmethod
    def _montar_prompt(
        texto_transcricao: str, meta: dict, *, cabecalho: str = "", variacao: str = ""
    ) -> str:
        # D-297: o scaffold (contrato de saída) vem do banco por canal; aqui só
        # calculamos os valores que envolvem lógica (duração humana, cabeçalho de lote).
        duracao = int(meta.get("duracao_segundos") or 0)
        return editorial_scaffolds.resolver_scaffold("cortes").format(
            variacao=variacao,
            cabecalho_section=f"*** {cabecalho} ***\n\n" if cabecalho else "",
            titulo_live=meta.get("titulo_live", ""),
            duracao_humana=f"{duracao // 3600}h{(duracao % 3600) // 60}m",
            youtube_url=meta.get("youtube_url", ""),
            texto_transcricao=texto_transcricao,
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
    def _formatar_segmentos(segmentos: list, mapa_falantes: dict | None = None) -> str:
        """Formata os segmentos como `[idx] (hms) [FALANTE] texto`.

        D-286: quando `mapa_falantes` é dado, prefixa cada linha com o rótulo do
        falante ([CANAL]/[OUTRO]) para a IA distinguir a fala do dono do canal da
        fala reagida. Sem mapa (ou sem `speaker` no segmento) a saída é idêntica
        ao comportamento antigo — back-compat total.
        """
        linhas = []
        for seg in segmentos:
            inicio = seg.get("inicio", seg.get("start", 0))
            texto = seg.get("texto", seg.get("text", "")).strip()
            if texto:
                idx = seg.get("global_index", 0)
                prefixo = prefixo_falante(seg.get("speaker"), mapa_falantes)
                linhas.append(f"[{idx}] ({seg_to_hms_short(_to_seg(inicio))}) {prefixo}{texto}")
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
            corte_inicio_seg = _to_seg(corte.inicio_seg or 0)
            corte_fim_seg = _to_seg(corte.fim_seg or 0)
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

        resultado = await ClaudeIaService._gerar_desvios(
            transcricao_bruta, meta, desvios_existentes, mapa_falantes
        )
        # WHY: origem='claude' permite o frontend exibir o badge correto
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
                    classificar_desvio(normalizar_desvio({**d, "origem": "claude"})),
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
        from app.services.corte import CorteService

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
    def _anotar_falantes_do_projeto(transcricao_bruta: list, transcricao_raw: list) -> list:
        """D-302: reanota o `speaker` nos segmentos do corte a partir da
        transcrição diarizada do projeto.

        A sincronização do corte (`transcricao_corte`) guarda só
        start/end/texto — o rótulo de falante vive na `transcricao_raw`. Os
        segmentos diarizados do projeto funcionam como turnos para
        `alinhar_falantes` (mesmo casamento por sobreposição da ingestão).
        """
        turnos = []
        for seg in transcricao_raw:
            if not isinstance(seg, dict) or not seg.get("speaker"):
                continue
            inicio = _to_seg(seg.get("inicio", seg.get("start", 0)))
            fim = _to_seg(seg.get("fim", seg.get("end", inicio)))
            turnos.append({"start": inicio, "end": fim, "speaker": seg["speaker"]})
        if not turnos:
            return transcricao_bruta
        return alinhar_falantes(transcricao_bruta, turnos)

    # D-355: janela curta para ancorar a borda de DESVIO — o timestamp do desvio
    # já é fino (nível de segmento ≤6 palavras), então basta ±5s; o snap (0.8s)
    # completa o ajuste de borda de palavra depois.
    _JANELA_ANCORA_DESVIO_SEG = 5.0

    @staticmethod
    def _ancorar_desvio(desvio: dict, palavras: list[dict]) -> dict:
        """D-355: ancora as bordas do desvio no tempo real da palavra citada
        (`inicio_texto`/`fim_texto`), dentro de ±5s do timestamp proposto.

        Sem citação, sem palavras (VTT legado) ou sem match → devolve o desvio
        inalterado (o `snap` a seguir faz o ajuste fino sozinho, como hoje).
        Nunca inverte a borda (garantido por `ancorar_intervalo`). Preserva os
        demais campos via `dict(desvio)`.
        """
        inicio_texto = (desvio.get("inicio_texto") or "").strip()
        fim_texto = (desvio.get("fim_texto") or "").strip()
        if not palavras or (not inicio_texto and not fim_texto):
            return desvio
        ini = _to_seg(desvio.get("inicio_seg") or 0)
        fim = _to_seg(desvio.get("fim_seg") or 0)
        novo_ini, novo_fim = ancorar_intervalo(
            inicio_texto,
            fim_texto,
            ini,
            fim,
            palavras,
            janela_seg=ClaudeIaService._JANELA_ANCORA_DESVIO_SEG,
        )
        if novo_ini == ini and novo_fim == fim:
            return desvio
        ajustado = dict(desvio)
        ini_r = round(novo_ini, 3)
        fim_r = round(novo_fim, 3)
        ajustado["inicio_seg"] = ini_r
        ajustado["fim_seg"] = fim_r
        ajustado["inicio_hms"] = seg_to_hms(ini_r)
        ajustado["fim_hms"] = seg_to_hms(fim_r)
        return ajustado

    @staticmethod
    def _palavras_do_corte(transcricao_raw: list, inicio_seg: float, fim_seg: float) -> list[dict]:
        """Lista achatada e ordenada das palavras (D-337) na janela do corte, com
        2s de folga nas bordas. Fonte: a `transcricao_raw` do projeto — a única que
        carrega o timing por palavra (a `transcricao_corte` o descarta). Sai vazia
        quando a transcrição não tem `palavras` (dados legados), tornando o snap
        um no-op (back-compat)."""
        if not isinstance(transcricao_raw, list):
            return []
        margem = 2.0
        palavras = achatar_palavras(transcricao_raw)
        if inicio_seg or fim_seg:
            palavras = [
                p for p in palavras if inicio_seg - margem <= p["inicio_seg"] <= fim_seg + margem
            ]
        return palavras

    @staticmethod
    async def _gerar_desvios(
        transcricao_bruta: list,
        meta: dict,
        existentes: list,
        mapa_falantes: dict | None = None,
    ) -> dict:
        # WHY: o prompt antigo (minimalista) sub-extraía desvios (~3 por corte longo).
        # Reaproveitamos o pipeline rico do fluxo "manual IA": limpamos+granularizamos
        # a transcrição, chunkificamos em partes (~40min com 5min de overlap) e mandamos
        # cada chunk com regras explícitas. Empata em qualidade com PROMPT_ANALISAR_DESVIOS
        # mas pede saída com a chave `desvios` (compatível com a skill trechos-expert).
        # D-332: retorna só {"desvios": [...]} agregados dos chunks — a revisão
        # automática da D-302 foi revogada; um eventual `revisoes` no JSON é ignorado.
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
        skill = editorial_skills.resolver_skill(_SKILL_TRECHOS)
        _log_skill_usada(_SKILL_TRECHOS, skill, editorial_scaffolds.resolver_scaffold("trechos"))

        novos: list = []
        for indice, chunk in enumerate(chunks):
            texto_chunk = ClaudeIaService._formatar_chunk_para_prompt(chunk, mapa_falantes)
            prompt = ClaudeIaService._montar_prompt_trechos(
                texto_chunk, cabecalho_meta, indice + 1, len(chunks)
            )
            t = time.perf_counter()
            resultado = await claude_cli_client.generate_json(
                prompt,
                **_args_claude(
                    skill,
                    _SKILL_TRECHOS,
                    projeto_id=meta.get("projeto_id"),
                    corte_id=meta.get("corte_id"),
                ),
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

        return {"desvios": novos}

    @staticmethod
    def _cabecalho_meta_corte(meta: dict, existentes: list) -> str:
        """Bloco de contexto editorial do corte — repetido em cada chunk para
        evitar que a IA confunda desvio com tese central.

        D-332: os trechos já marcados são apenas LISTADOS, com a instrução de
        não repeti-los e propor APENAS NOVOS. A revisão automática da D-302 foi
        revogada — sem [REVISÁVEL]/[PROTEGIDO] e sem contrato de `revisoes`.

        D-349: PERMANECE no código (não vira scaffold): é DADO COMPUTADO do corte
        (título/tema/intervalo + lista de trechos já marcados), não prosa editável.
        O scaffold de trechos o consome via placeholder `{cabecalho_meta}`.
        """
        ja_marcados = ""
        if existentes:
            linhas = "\n".join(
                f"- {d.get('inicio_hms', '')} → {d.get('fim_hms', '')} ({d.get('motivo', '')})"
                for d in existentes
            )
            ja_marcados = (
                "\n=== TRECHOS JÁ MARCADOS (não repita estes; proponha APENAS NOVOS "
                "em `desvios`) ===\n"
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
    def _formatar_chunk_para_prompt(chunk: list, mapa_falantes: dict | None = None) -> str:
        """Formata `(hms) [FALANTE] texto`. D-302: com mapa de falantes, prefixa
        o rótulo [CANAL]/[OUTRO]; sem mapa, saída idêntica ao formato antigo."""
        linhas = []
        for item in chunk:
            inicio = item.get("start", item.get("inicio", 0))
            texto = str(item.get("texto", item.get("text", ""))).strip()
            if texto:
                prefixo = prefixo_falante(item.get("speaker"), mapa_falantes)
                linhas.append(f"({seg_to_hms_short(float(inicio))}) {prefixo}{texto}")
        return "\n".join(linhas)

    @staticmethod
    def _montar_prompt_trechos(
        texto_transcricao: str, cabecalho_meta: str, parte: int, total_partes: int
    ) -> str:
        # D-297: o scaffold (regras detalhadas + formato JSON com a chave `desvios`)
        # vem do banco por canal; aqui só calculamos o cabeçalho de lote.
        cabecalho_parte = (
            f"*** ATENÇÃO: Esta é a PARTE {parte} de {total_partes} do corte. "
            f"Identifique os trechos a remover APENAS para esta parte. ***\n\n"
            if total_partes > 1
            else ""
        )
        return editorial_scaffolds.resolver_scaffold("trechos").format(
            cabecalho_parte=cabecalho_parte,
            cabecalho_meta=cabecalho_meta,
            texto_transcricao=texto_transcricao,
        )

    # ── Fase 3: cenas e metadados via Claude (incremental ou em paralelo) ─────

    @staticmethod
    async def gerar_cenas_via_claude(corte_id: str) -> dict:
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
        chave_fila = fila_ia.anunciar_inicio(_SKILL_CENAS, corte_id=corte_id)
        try:
            resultado = await ClaudeIaService._gerar_cenas(corte_id)
        except BaseException as exc:
            fila_ia.anunciar_fim(chave_fila, sucesso=False, erro=fila_ia.mensagem_de(exc))
            raise
        fila_ia.anunciar_fim(chave_fila, sucesso=True)
        return resultado

    @staticmethod
    async def _gerar_cenas(corte_id: str) -> dict:
        """Corpo da geração de cenas — ver `gerar_cenas_via_claude`."""
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

        skill = editorial_skills.resolver_skill(_SKILL_CENAS)
        _log_skill_usada(_SKILL_CENAS, skill)
        # Uma lente por geração (consistente entre as partes), do banco por canal.
        variacao = bloco_variacao_de(skill.lentes)
        cenas: list = []
        for indice, parte in enumerate(prompts):
            prompt = f"{variacao}\n\n{parte['texto']}"
            t = time.perf_counter()
            resultado = await claude_cli_client.generate_json(
                prompt, **_args_claude(skill, _SKILL_CENAS, corte_id=corte_id)
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

        skill = editorial_skills.resolver_skill(_SKILL_METADADOS)
        ctx = await MetadadosService.montar_contexto_meta(corte_id)
        # D-349: o scaffold (invólucro "INPUT DO CORTE" + contrato de saída) vem do
        # banco por canal, como as demais etapas. O corpo/expertise (regras de
        # título, checklist, seção OUTPUT) continua na skill metadados-expert.
        scaffold_meta = editorial_scaffolds.resolver_scaffold("metadados")
        prompt = scaffold_meta.format(
            variacao=bloco_variacao_de(skill.lentes),
            titulo_proposto=ctx["titulo_proposto"],
            tema_central=ctx["tema"],
            numero_corte=ctx["numero_corte"],
            resumo_historico=ctx["resumo"],
            transcricao_marcada=ctx["transcricao_marcada"],
            historico_titulos=ctx["historico_titulos"],
        )
        _log_skill_usada(_SKILL_METADADOS, skill, scaffold_meta)
        resultado = await claude_cli_client.generate_json(
            prompt, **_args_claude(skill, _SKILL_METADADOS, corte_id=corte_id)
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
            transcricao_dados = _carregar_transcricao_raw(projeto.transcricao_raw, corte.projeto_id)
            projeto_id = corte.projeto_id
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

        # Resumo é bespoke (sem corpo de skill), mas reusa modelo + lentes de
        # metadados por canal (E-021) — mantém a etapa alinhada à config do canal.
        # D-297: o scaffold (contrato de saída) vem do banco por canal.
        skill = editorial_skills.resolver_skill(_SKILL_METADADOS)
        scaffold_resumo = editorial_scaffolds.resolver_scaffold("resumo")
        prompt = scaffold_resumo.format(
            variacao=bloco_variacao_de(skill.lentes),
            titulo=titulo,
            tema=tema,
            resumo_antigo=resumo_antigo,
            transcricao=transcricao_filtrada,
        )
        _log_skill_usada(_SKILL_METADADOS, skill, scaffold_resumo)
        resultado = await claude_cli_client.generate_json(
            prompt,
            model=skill.modelo,
            contexto=claude_cli_client.LlmCallContext(
                etapa="resumo", projeto_id=projeto_id, corte_id=corte_id
            ),
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

    @staticmethod
    async def avaliar_bruto_via_claude(corte_id: str) -> dict:
        """Avalia a ESTRUTURA do bruto recém-gerado e registra o parecer (D-447).

        Roda depois da geração do bruto, sobre a transcrição que sobrou com as
        emendas marcadas — o único material em que os defeitos de costura são
        visíveis. Persiste uma linha na série de avaliações do corte.

        Levanta `LookupError` (corte inexistente) ou `ValueError` (sem
        transcrição final, ou retorno do modelo sem nota utilizável). Quem chama
        no fluxo automático trata a falha como não-fatal: a avaliação é
        observação sobre o bruto, não parte da entrega dele.
        """
        from app.domain.avaliacao_bruto import normalizar_avaliacao, tipos_disponiveis
        from app.services import avaliacao_bruto as avaliacao_store

        contexto = await avaliacao_store.montar_contexto(corte_id)

        skill = editorial_skills.resolver_skill(_SKILL_AVALIACAO)
        scaffold = editorial_scaffolds.resolver_scaffold("avaliacao-bruto")
        prompt = scaffold.format(
            titulo=contexto.titulo,
            tema_central=contexto.tema_central,
            duracao_humana=seg_to_hms_short(contexto.duracao_seg),
            total_emendas=contexto.total_emendas,
            removido_humano=seg_to_hms_short(contexto.removido_seg),
            tipos_apontamento="\n".join(
                f"- {tipo['slug']}: {tipo['rotulo']}" for tipo in tipos_disponiveis()
            ),
            texto_avaliado=contexto.texto_avaliado,
        )
        _log_skill_usada(_SKILL_AVALIACAO, skill, scaffold)
        resultado = await claude_cli_client.generate_json(
            prompt,
            **_args_claude(
                skill,
                _SKILL_AVALIACAO,
                projeto_id=contexto.projeto_id,
                corte_id=corte_id,
            ),
        )
        return await avaliacao_store.registrar_avaliacao(
            contexto,
            normalizar_avaliacao(resultado),
            modelo=skill.modelo,
            skill_sha=_sha1_curto(skill.corpo),
        )

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
        # D-349: este bloco PERMANECE no código (não vira scaffold): é DADO
        # COMPUTADO a partir das flags editoriais do corte (is_fire/is_leitura), não
        # prosa editável. O scaffold de thumbnail o consome via `{marca_emojis}`.
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
        skill = editorial_skills.resolver_skill(_SKILL_THUMBNAIL)
        _log_skill_usada(
            _SKILL_THUMBNAIL, skill, editorial_scaffolds.resolver_scaffold("thumbnail")
        )
        texto = await claude_cli_client.generate_text(
            prompt, **_args_claude(skill, _SKILL_THUMBNAIL, corte_id=corte_id)
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
        # D-297: o scaffold (contexto do corte + regras não-negociáveis + formato de
        # saída [VARIATION_TAGS]) vem do banco por canal. O método editorial completo
        # continua na skill thumbnail-prompt-expert (corpo/expertise).
        return editorial_scaffolds.resolver_scaffold("thumbnail").format(
            tema=ctx["tema"],
            titulo_youtube=ctx["titulo_youtube"],
            texto_capa=ctx["texto_capa"],
            resumo=ctx["resumo"],
            marca_emojis=marca_emojis,
            bloco_hints=bloco_hints,
            transcricao=ctx["transcricao"],
            historico_visual=ctx["historico_visual"],
            mascote=mascote,
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
