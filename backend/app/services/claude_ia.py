"""Serviço das gerações editoriais por IA (Claude CLI e Antigravity; ver ADR-0004).

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

from app import editorial_scaffolds, editorial_skills
from app.channel_paths import projetos_dir
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.canal.variacao_prompt import bloco_variacao_de
from app.domain.compartilhado.gerador_ia import PedidoIA
from app.domain.compartilhado.time_convert import hms_to_seg, seg_to_hms_short, to_seg_estrito
from app.domain.projeto import chat_heat
from app.domain.projeto.analise_aditiva import bucket_de_30s, mesclar_descartados
from app.domain.projeto.chunker import fatiar_transcricao
from app.domain.projeto.diarizacao_align import prefixo_falante
from app.domain.projeto.transcricao_utils import (
    dividir_segmentos_longos,
    limpar_e_ordenar_transcricao,
)
from app.infrastructure import claude_cli_client, fila_ia
from app.infrastructure.gerador_ia import gerador_para
from app.models import Corte, Projeto
from app.provider_ia import ProviderIA

logger = logging.getLogger(__name__)


def _sha1_curto(texto: str) -> str:
    """SHA1 (8 primeiros hex) de um texto — impressão digital estável e curta."""
    return hashlib.sha1((texto or "").encode("utf-8")).hexdigest()[:8]


def registrar_skill_usada(
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
SKILL_METADADOS = "metadados-expert"
_SKILL_AVALIACAO = "avaliador-bruto"


def _pedido(
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
) -> PedidoIA:
    """O pedido à IA a partir da skill resolvida (E-021), para qualquer provider.

    `expertise` (corpo do banco) é a fonte da verdade; `skill` fica como FALLBACK
    nativo (`/<skill>`) do Claude caso o corpo venha vazio.

    D-353: a etapa (skill_key) e o projeto/corte/short vão para a telemetria das
    chamadas de IA. `None` é aceitável — grava o que houver.
    """
    return PedidoIA(
        etapa=skill_key,
        modelo=skill.modelo,
        modelo_gemini=skill.modelo_gemini,
        skill=skill_key,
        expertise=skill.corpo,
        timeout=skill.timeout,
        thinking_tokens=skill.thinking_tokens,
        projeto_id=projeto_id,
        corte_id=corte_id,
        short_id=short_id,
    )


def _modelo_usado(skill: editorial_skills.SkillResolvida, provider: ProviderIA) -> str:
    """O modelo que ATENDEU a chamada — é dele que a tela deriva o selo."""
    return gerador_para(provider).modelo(_pedido(skill, skill.key))


async def gerar_json(
    provider: ProviderIA,
    prompt: str,
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
) -> dict:
    pedido = _pedido(skill, skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id)
    return await gerador_para(provider).gerar_json(prompt, pedido)


async def gerar_texto(
    provider: ProviderIA,
    prompt: str,
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
) -> str:
    pedido = _pedido(skill, skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id)
    return await gerador_para(provider).gerar_texto(prompt, pedido)


def _janela_do_chunk(chunk: list) -> tuple[float, float]:
    """Intervalo (início, fim) em segundos coberto por uma parte da transcrição."""
    if not chunk:
        return (0.0, 0.0)
    inicio = to_seg_estrito(chunk[0].get("inicio", chunk[0].get("start", 0)))
    ultimo = chunk[-1]
    fim = to_seg_estrito(ultimo.get("fim", ultimo.get("end", ultimo.get("inicio", 0))))
    return (float(inicio), float(max(fim, inicio)))


def sem_cercas_de_codigo(texto: str) -> str:
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

    # ── modo aditivo: dedup por bucket de 30s + merge de descartados (D-298) ──

    # ── geração dos cortes (decide direto vs lote pelo tamanho) ───────────────

    @staticmethod
    async def gerar_cortes(transcricao: list, meta: dict, provider: ProviderIA = "claude") -> dict:
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

        picos_chat = ClaudeIaService._picos_do_chat(meta)

        if len(texto_completo) <= settings.claude_analise_max_chars_direto:
            logger.info("[ClaudeIA] Análise DIRETA (%d chars)", len(texto_completo))
            prompt = ClaudeIaService._montar_prompt(
                texto_completo,
                meta,
                dica_chat=chat_heat.formatar_dica(picos_chat),
                variacao=bloco_variacao_de(skill.lentes),
            )
            registrar_skill_usada(
                _SKILL_CORTES, skill, editorial_scaffolds.resolver_scaffold("cortes")
            )
            resultado = await gerar_json(
                provider, prompt, skill, _SKILL_CORTES, projeto_id=meta.get("projeto_id")
            )
            return {
                "cortes": resultado.get("cortes", []),
                "descartados": resultado.get("descartados", []) or [],
            }

        return await ClaudeIaService._gerar_cortes_em_lote(
            segmentos, meta, len(texto_completo), skill, mapa_falantes, picos_chat, provider
        )

    @staticmethod
    async def _gerar_cortes_em_lote(
        segmentos: list,
        meta: dict,
        total_chars: int,
        skill: editorial_skills.SkillResolvida,
        mapa_falantes: dict | None = None,
        picos_chat: list | None = None,
        provider: ProviderIA = "claude",
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
        registrar_skill_usada(_SKILL_CORTES, skill, editorial_scaffolds.resolver_scaffold("cortes"))
        cortes: list = []
        vistos: set[int] = set()
        descartados: list = []
        for indice, chunk in enumerate(chunks):
            texto = ClaudeIaService._formatar_segmentos(chunk, mapa_falantes)
            # A pista do chat é recortada para a janela DESTA parte: citar um
            # instante que ficou noutro chunk mandaria a IA propor corte em
            # material que ela não está vendo.
            dica = chat_heat.formatar_dica(
                chat_heat.picos_no_intervalo(picos_chat or [], *_janela_do_chunk(chunk))
            )
            prompt = ClaudeIaService._montar_prompt(
                texto,
                meta,
                cabecalho=f"PARTE {indice + 1} de {len(chunks)} da transcrição.",
                dica_chat=dica,
                variacao=variacao,
            )
            resultado = await gerar_json(
                provider, prompt, skill, _SKILL_CORTES, projeto_id=meta.get("projeto_id")
            )
            for corte in resultado.get("cortes", []):
                chave = bucket_de_30s(corte.get("inicio_seg"))
                if chave in vistos:
                    continue
                vistos.add(chave)
                cortes.append(corte)
            descartados = mesclar_descartados(descartados, resultado.get("descartados"))
        return {"cortes": cortes, "descartados": descartados}

    # ── montagem do prompt e da transcrição ───────────────────────────────────

    @staticmethod
    def montar_prompt_manual_cortes(
        texto_transcricao: str, meta: dict, *, cabecalho: str = ""
    ) -> str:
        """Prompt para colar numa IA externa (modo manual, D-631).

        Mesma receita da geração automática: a expertise da skill `cortador-expert`
        do canal (que no CLI entra como system prompt) vem antes do scaffold `cortes`,
        num texto só — o JSON devolvido segue o formato que `importar_resultado` lê.
        """
        skill = editorial_skills.resolver_skill(_SKILL_CORTES)
        prompt = ClaudeIaService._montar_prompt(
            texto_transcricao,
            meta,
            cabecalho=cabecalho,
            variacao=bloco_variacao_de(skill.lentes),
        )
        expertise = (skill.corpo or "").strip()
        return f"{expertise}\n\n{prompt}" if expertise else prompt

    @staticmethod
    def _montar_prompt(
        texto_transcricao: str,
        meta: dict,
        *,
        cabecalho: str = "",
        dica_chat: str = "",
        variacao: str = "",
    ) -> str:
        # D-297: o scaffold (contrato de saída) vem do banco por canal; aqui só
        # calculamos os valores que envolvem lógica (duração humana, cabeçalho de lote).
        #
        # M1: a pista do chat entra pelo `cabecalho_section` — placeholder que já
        # existe em todos os scaffolds. Criar um novo obrigaria a editar o
        # scaffold de cada canal, e um `.format()` sem a chave nova quebraria a
        # análise inteira. Os asteriscos ficam só no marcador de parte: são um
        # rótulo curto, não um invólucro para blocos de várias linhas.
        blocos = []
        if cabecalho:
            blocos.append(f"*** {cabecalho} ***")
        if dica_chat:
            blocos.append(dica_chat)
        duracao = int(meta.get("duracao_segundos") or 0)
        return editorial_scaffolds.resolver_scaffold("cortes").format(
            variacao=variacao,
            cabecalho_section="\n\n".join(blocos) + "\n\n" if blocos else "",
            titulo_live=meta.get("titulo_live", ""),
            duracao_humana=f"{duracao // 3600}h{(duracao % 3600) // 60}m",
            youtube_url=meta.get("youtube_url", ""),
            texto_transcricao=texto_transcricao,
        )

    @staticmethod
    def _picos_do_chat(meta: dict) -> list:
        """Momentos em que a audiência reagiu, lidos do chat replay (M1).

        Devolve lista vazia em qualquer contratempo — sem arquivo, sem replay,
        JSON corrompido: a pista é opcional e nunca pode derrubar a análise.
        """
        projeto_id = meta.get("projeto_id")
        duracao = float(meta.get("duracao_segundos") or 0)
        if not projeto_id or duracao <= 0:
            return []
        try:
            arquivos = sorted(
                (projetos_dir() / str(projeto_id) / "subtitles").glob("*.live_chat.json")
            )
            if not arquivos:
                return []
            conteudo = arquivos[0].read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            logger.info("[ClaudeIA] Chat replay ilegível (%s); sigo sem a pista.", e)
            return []
        picos = chat_heat.picos_significativos(chat_heat.parse_live_chat(conteudo), duracao)
        if picos:
            logger.info("[ClaudeIA] Chat: %d momento(s) de reação acima do acaso.", len(picos))
        return picos

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
                linhas.append(
                    f"[{idx}] ({seg_to_hms_short(to_seg_estrito(inicio))}) {prefixo}{texto}"
                )
        return "\n".join(linhas)

    # ── encadeamento do "refazer transcrição" ─────────────────────────────────

    # ── Fase 2b: regerar trechos a remover (desvios) de UM corte ──────────────

    @staticmethod
    async def gerar_desvios(
        transcricao_bruta: list,
        meta: dict,
        existentes: list,
        mapa_falantes: dict | None = None,
        provider: ProviderIA = "claude",
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
        registrar_skill_usada(
            _SKILL_TRECHOS, skill, editorial_scaffolds.resolver_scaffold("trechos")
        )

        novos: list = []
        for indice, chunk in enumerate(chunks):
            texto_chunk = ClaudeIaService._formatar_chunk_para_prompt(chunk, mapa_falantes)
            prompt = ClaudeIaService._montar_prompt_trechos(
                texto_chunk, cabecalho_meta, indice + 1, len(chunks)
            )
            t = time.perf_counter()
            resultado = await gerar_json(
                provider,
                prompt,
                skill,
                _SKILL_TRECHOS,
                projeto_id=meta.get("projeto_id"),
                corte_id=meta.get("corte_id"),
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
            resultado = await ClaudeIaService._gerar_cenas(corte_id, provider)
        except BaseException as exc:
            fila_ia.anunciar_fim(chave_fila, sucesso=False, erro=fila_ia.mensagem_de(exc))
            raise
        fila_ia.anunciar_fim(chave_fila, sucesso=True)
        return resultado

    @staticmethod
    async def _gerar_cenas(corte_id: str, provider: ProviderIA = "claude") -> dict:
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
        skill = editorial_skills.resolver_skill(SKILL_METADADOS)
        scaffold_resumo = editorial_scaffolds.resolver_scaffold("resumo")
        prompt = scaffold_resumo.format(
            variacao=bloco_variacao_de(skill.lentes),
            titulo=titulo,
            tema=tema,
            resumo_antigo=resumo_antigo,
            transcricao=transcricao_filtrada,
        )
        registrar_skill_usada(SKILL_METADADOS, skill, scaffold_resumo)
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
    async def avaliar_bruto_via_claude(corte_id: str, provider: ProviderIA = "claude") -> dict:
        """Avalia a ESTRUTURA do bruto recém-gerado e registra o parecer (D-447).

        Roda depois da geração do bruto, sobre a transcrição que sobrou com as
        emendas marcadas — o único material em que os defeitos de costura são
        visíveis. Persiste uma linha na série de avaliações do corte.

        Levanta `LookupError` (corte inexistente) ou `ValueError` (sem
        transcrição final, ou retorno do modelo sem nota utilizável). Quem chama
        no fluxo automático trata a falha como não-fatal: a avaliação é
        observação sobre o bruto, não parte da entrega dele.
        """
        from app.domain.corte.avaliacao_bruto import normalizar_avaliacao, tipos_disponiveis
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
        registrar_skill_usada(_SKILL_AVALIACAO, skill, scaffold)
        resultado = await gerar_json(
            provider,
            prompt,
            skill,
            _SKILL_AVALIACAO,
            projeto_id=contexto.projeto_id,
            corte_id=corte_id,
        )
        return await avaliacao_store.registrar_avaliacao(
            contexto,
            normalizar_avaliacao(resultado),
            modelo=_modelo_usado(skill, provider),
            skill_sha=_sha1_curto(skill.corpo),
        )

    # ── Fase 4: prompt de thumbnail via Claude (skill capista) ────────────────
