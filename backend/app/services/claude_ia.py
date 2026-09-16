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
from app.channel_paths import projetos_dir
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain import chat_heat
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
from app.infrastructure import antigravity_cli_client, claude_cli_client, fila_ia
from app.models import Corte, Projeto, StatusProjeto
from app.provider_ia import ProviderIA
from app.services.analise import AnaliseService, _to_seg
from app.services.tasks import fire_and_forget
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
_SKILL_SHORTS = "shorts-expert"
_SKILL_CENAS_SHORT = "cenas-short-expert"
_SKILL_GANCHO_SHORT = "gancho-short-expert"
_SKILL_METADADOS_SHORT = "metadados-short-expert"
_SKILL_CAPA_TIKTOK = "capa-tiktok-expert"
_SKILL_CAPA_TIKTOK_IMAGEM = "capa-tiktok-imagem-expert"
_SKILL_CAPA_SHORT = "capa-short-imagem-expert"

# A mensagem cabe num toast; o texto integral do descarte fica na auditoria.
_LIMITE_MOTIVO_NA_TELA = 400


def _args_claude(
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
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
            etapa=skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id
        ),
    }


def _modelo_usado(skill: editorial_skills.SkillResolvida, provider: ProviderIA) -> str:
    """O modelo que ATENDEU a chamada — é dele que a tela deriva o selo."""
    return skill.modelo_gemini if provider == "gemini" else skill.modelo


def _args_antigravity(
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
) -> dict:
    """kwargs do `antigravity_cli_client`: a MESMA skill, com o modelo Gemini dela.

    O provider "gemini" roda pelo `agy -p` (assinatura do Antigravity), não pela
    API: corpo, timeout e contexto de telemetria são os mesmos do Claude.
    """
    return {
        "model": skill.modelo_gemini,
        "expertise": skill.corpo,
        "timeout": skill.timeout,
        "contexto": claude_cli_client.LlmCallContext(
            etapa=skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id
        ),
    }


async def _gerar_json_provider(
    provider: ProviderIA,
    prompt: str,
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
) -> dict:
    """Roteia a geração de JSON para o Claude CLI ou para o Antigravity CLI."""
    if provider == "gemini":
        args = _args_antigravity(
            skill, skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id
        )
        return await antigravity_cli_client.generate_json(prompt, **args)
    args = _args_claude(
        skill, skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id
    )
    return await claude_cli_client.generate_json(prompt, **args)


async def _gerar_text_provider(
    provider: ProviderIA,
    prompt: str,
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    *,
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
) -> str:
    """Roteia a geração de texto livre para o Claude CLI ou para o Antigravity CLI."""
    if provider == "gemini":
        args = _args_antigravity(
            skill, skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id
        )
        return await antigravity_cli_client.generate_text(prompt, **args)
    args = _args_claude(
        skill, skill_key, projeto_id=projeto_id, corte_id=corte_id, short_id=short_id
    )
    return await claude_cli_client.generate_text(prompt, **args)


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


def _janela_do_chunk(chunk: list) -> tuple[float, float]:
    """Intervalo (início, fim) em segundos coberto por uma parte da transcrição."""
    if not chunk:
        return (0.0, 0.0)
    inicio = _to_seg(chunk[0].get("inicio", chunk[0].get("start", 0)))
    ultimo = chunk[-1]
    fim = _to_seg(ultimo.get("fim", ultimo.get("end", ultimo.get("inicio", 0))))
    return (float(inicio), float(max(fim, inicio)))


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
            payload = await ClaudeIaService._gerar_cortes(transcricao, meta, provider)
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
                origem=provider,
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
    async def _gerar_cortes(transcricao: list, meta: dict, provider: ProviderIA = "claude") -> dict:
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
            _log_skill_usada(_SKILL_CORTES, skill, editorial_scaffolds.resolver_scaffold("cortes"))
            resultado = await _gerar_json_provider(
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
        _log_skill_usada(_SKILL_CORTES, skill, editorial_scaffolds.resolver_scaffold("cortes"))
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
            resultado = await _gerar_json_provider(
                provider, prompt, skill, _SKILL_CORTES, projeto_id=meta.get("projeto_id")
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
        _log_skill_usada(_SKILL_TRECHOS, skill, editorial_scaffolds.resolver_scaffold("trechos"))

        novos: list = []
        for indice, chunk in enumerate(chunks):
            texto_chunk = ClaudeIaService._formatar_chunk_para_prompt(chunk, mapa_falantes)
            prompt = ClaudeIaService._montar_prompt_trechos(
                texto_chunk, cabecalho_meta, indice + 1, len(chunks)
            )
            t = time.perf_counter()
            resultado = await _gerar_json_provider(
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
        _log_skill_usada(_SKILL_CENAS, skill)
        # Uma lente por geração (consistente entre as partes), do banco por canal.
        variacao = bloco_variacao_de(skill.lentes)
        cenas: list = []
        for indice, parte in enumerate(prompts):
            prompt = f"{variacao}\n\n{parte['texto']}"
            t = time.perf_counter()
            resultado = await _gerar_json_provider(
                provider, prompt, skill, _SKILL_CENAS, corte_id=corte_id
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
    async def gerar_metadados_via_claude(corte_id: str, provider: ProviderIA = "claude") -> dict:
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
        resultado = await _gerar_json_provider(
            provider, prompt, skill, _SKILL_METADADOS, corte_id=corte_id
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
        resultado = await _gerar_json_provider(
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

    @staticmethod
    async def sugerir_shorts_via_claude(corte_id: str, provider: ProviderIA = "claude") -> dict:
        """Propõe os trechos verticais do bruto recém-gerado e os persiste (D-454).

        Roda sobre `Corte.transcricao_final` — a transcrição já sem os desvios e
        com os tempos **rebaseados na timeline do bruto**. É desse arquivo que o
        short será recortado, então é nesse relógio que os candidatos nascem.

        Levanta `LookupError` (corte inexistente) ou `ValueError` (sem transcrição
        final). Quem chama no fluxo automático trata a falha como não-fatal: a
        sugestão de shorts é derivada do bruto, não parte da entrega dele.
        """
        from app.domain.shorts import FaixaShort, normalizar_sugestoes
        from app.services import shorts as shorts_store

        contexto = await shorts_store.montar_contexto(corte_id)
        faixa = FaixaShort(
            duracao_min_seg=settings.shorts_duracao_min_seg,
            duracao_max_seg=settings.shorts_duracao_max_seg,
            quantidade_min=settings.shorts_quantidade_min,
            quantidade_max=settings.shorts_quantidade_max,
        )

        skill = editorial_skills.resolver_skill(_SKILL_SHORTS)
        scaffold = editorial_scaffolds.resolver_scaffold("shorts")
        prompt = scaffold.format(
            titulo=contexto.titulo,
            tema_central=contexto.tema_central,
            duracao_humana=seg_to_hms_short(contexto.duracao_seg),
            quantidade_alvo=faixa.quantidade_humana,
            faixa_duracao=faixa.duracao_humana,
            texto_transcricao=contexto.texto_transcricao,
        )
        _log_skill_usada(_SKILL_SHORTS, skill, scaffold)
        resposta = await _gerar_json_provider(
            provider,
            prompt,
            skill,
            _SKILL_SHORTS,
            projeto_id=contexto.projeto_id,
            corte_id=corte_id,
        )
        resultado = normalizar_sugestoes(
            resposta, duracao_bruto_seg=contexto.duracao_seg, faixa=faixa
        )
        shorts = await shorts_store.registrar_sugestoes(contexto, resultado)
        return {"shorts": shorts, "descartes": resultado.descartes}

    @staticmethod
    async def sugerir_cenas_do_short_via_claude(
        short_id: str, provider: ProviderIA = "claude"
    ) -> dict:
        """Propõe os cartões que entram por cima de UM trecho vertical (D-497).

        No horizontal a IA propõe as cenas desde sempre; aqui o painel da D-494
        só sabia criar à mão. A skill é OUTRA (`cenas-short-expert`) porque o
        repertório é outro: lá são fichas e ênfases num vídeo de dez minutos,
        aqui são quatro cartões disputando trinta segundos de tela vertical, com
        a legenda queimada embaixo.

        As cenas voltam GRAVADAS, substituindo as que existiam. Propor sem
        gravar deixaria o operador com uma lista que ele teria de reescrever à
        mão para usar; e o que existia antes é ou vazio (o caso comum) ou um
        palpite anterior da própria IA. Um short com cenas escritas à mão só
        chega aqui se o operador pedir de novo — e aí ele pediu.

        Levanta `LookupError` (short inexistente) ou `ValueError` (trecho sem
        transcrição). Devolve o short atualizado e os descartes, que são o que
        explica por que a IA falou em cinco cenas e a tela mostra três.
        """
        from app.domain.cenas_short import TipoCenaShort
        from app.domain.cenas_short_ia import normalizar_sugestoes as normalizar_cenas
        from app.services import shorts as shorts_store

        contexto = await shorts_store.montar_contexto_de_cenas(short_id)

        skill = editorial_skills.resolver_skill(_SKILL_CENAS_SHORT)
        scaffold = editorial_scaffolds.resolver_scaffold("cenas-short")
        prompt = scaffold.format(
            titulo=contexto.titulo,
            gancho=contexto.gancho,
            duracao_humana=f"{contexto.duracao_seg:.0f} segundos",
            tipos_disponiveis=", ".join(t.value for t in TipoCenaShort),
            texto_transcricao=contexto.texto_transcricao,
        )
        _log_skill_usada(_SKILL_CENAS_SHORT, skill, scaffold)
        resposta = await _gerar_json_provider(
            provider,
            prompt,
            skill,
            _SKILL_CENAS_SHORT,
            projeto_id=contexto.projeto_id,
            corte_id=contexto.corte_id,
            short_id=short_id,
        )
        resultado = normalizar_cenas(resposta, duracao_short=contexto.duracao_seg)
        short = await shorts_store.definir_cenas(
            short_id, [cena.para_json() for cena in resultado.cenas]
        )
        logger.info(
            "[Shorts] cenas IA short=%s aceitas=%d descartadas=%d",
            short_id[:8],
            len(resultado.cenas),
            len(resultado.descartes),
        )
        return {"short": short, "descartes": resultado.descartes}

    @staticmethod
    async def sugerir_ganchos_via_claude(
        short_id: str, provider: ProviderIA = "claude"
    ) -> list[str]:
        """As variacoes do texto que abre o short (D-565).

        Skill separada da capa do TikTok, e nao um parametro dela, porque as duas
        escrevem coisas de generos opostos. La sao 2-3 palavras que NOMEIAM o
        assunto numa prateleira onde nove capas sao vistas juntas, e repetir da
        coerencia. Aqui e uma frase de 4-7 palavras que ABRE uma pergunta em quem
        esta com o dedo em movimento — e repetir, no feed, parece robo.

        A base e a transcricao do TRECHO, nao o resumo do corte: o gancho promete,
        e a promessa tem de estar no que este short mostra.

        NAO grava nada. As variacoes vao para a tela e o operador escolhe uma,
        escreve a dele, ou ignora todas — a decisao editorial continua sendo
        humana, e gravar por conta propria tiraria dele a chance de comparar.

        Levanta `LookupError` (short inexistente) e `ValueError` (trecho sem
        fala). Lista vazia quando o modelo nao produziu nada aproveitavel.
        """
        from app.domain.gancho_short import MAX_VARIACOES, ganchos_da_resposta
        from app.services import shorts as shorts_store

        contexto = await shorts_store.montar_contexto_do_gancho(short_id)

        skill = editorial_skills.resolver_skill(_SKILL_GANCHO_SHORT)
        scaffold = editorial_scaffolds.resolver_scaffold("gancho-short")
        prompt = scaffold.format(
            titulo_proposto=contexto.titulo,
            tema_central=contexto.tema_central,
            duracao_seg=contexto.duracao_seg,
            texto_transcricao=contexto.texto_transcricao,
            gancho_da_curadoria=contexto.gancho_da_curadoria,
            ganchos_recentes=contexto.ganchos_recentes,
            quantidade=MAX_VARIACOES,
        )
        _log_skill_usada(_SKILL_GANCHO_SHORT, skill, scaffold)
        bruto = await _gerar_text_provider(
            provider,
            prompt,
            skill,
            _SKILL_GANCHO_SHORT,
            projeto_id=contexto.projeto_id,
            corte_id=contexto.corte_id,
            short_id=short_id,
        )
        # O historico vai ao prompt E ao parser: um pede, o outro garante.
        variacoes = ganchos_da_resposta(bruto, ja_usados=contexto.ganchos_gastos)
        logger.info(
            "[Shorts] ganchos IA short=%s variacoes=%d",
            short_id[:8],
            len(variacoes),
        )
        return variacoes

    @staticmethod
    async def gerar_post_do_short_via_claude(
        short_id: str, provider: ProviderIA = "claude"
    ) -> dict:
        """O titulo, a descricao e as hashtags que acompanham o short no feed.

        Skill separada dos `metadados-expert` do corte, e nao um parametro deles,
        porque os leitores sao outros. La o titulo e um cartaz disputando o
        clique numa lista de resultados, com 55-60 caracteres de manchete; aqui
        ele e lido por quem JA parou, com ~40 caracteres visiveis, e vira a
        primeira linha da legenda no TikTok e no Instagram — que nem campo de
        titulo tem.

        GRAVA no `MetadadoShort`, diferente do gerador de ganchos. A diferenca e
        de risco: o gancho e uma frase que vai virar PIXEL no video, e escolher
        por ele seria tirar a decisao mais editorial da tela de quem tem o
        contexto; o post e texto de publicacao, que ele le e edita antes de subir
        — e que ate aqui era montado automaticamente sem ninguem revisar.

        Resposta inaproveitavel nao apaga o que existe: `gravar` recusa post sem
        titulo. Levanta `LookupError` (short inexistente) e `ValueError` (trecho
        sem fala).
        """
        from app.domain.metadados_short import post_da_resposta
        from app.services import metadados_short as post_store

        contexto = await post_store.montar_contexto(short_id)

        skill = editorial_skills.resolver_skill(_SKILL_METADADOS_SHORT)
        scaffold = editorial_scaffolds.resolver_scaffold("metadados-short")
        prompt = scaffold.format(
            titulo_proposto=contexto.titulo,
            tema_central=contexto.tema_central,
            duracao_seg=contexto.duracao_seg,
            texto_transcricao=contexto.texto_transcricao,
            gancho_na_tela=contexto.gancho_na_tela,
            titulos_recentes=contexto.titulos_recentes,
            titulo_visivel=contexto.titulo_visivel,
            titulo_max=contexto.titulo_max,
        )
        _log_skill_usada(_SKILL_METADADOS_SHORT, skill, scaffold)
        bruto = await _gerar_text_provider(
            provider,
            prompt,
            skill,
            _SKILL_METADADOS_SHORT,
            projeto_id=contexto.projeto_id,
            corte_id=contexto.corte_id,
            short_id=short_id,
        )
        post = post_da_resposta(bruto)
        logger.info(
            "[Shorts] post IA short=%s titulo=%dch hashtags=%d",
            short_id[:8],
            len(post.titulo),
            len(post.hashtags),
        )
        return await post_store.gravar(short_id, post)

    # ── Fase 4: prompt de thumbnail via Claude (skill capista) ────────────────

    @staticmethod
    async def sugerir_etiqueta_capa_via_claude(
        corte_id: str, provider: ProviderIA = "claude"
    ) -> str:
        """As 2-3 palavras que vão no alto da capa vertical do TikTok (D-520).

        Skill separada da do YouTube, e não um parâmetro dela, porque as duas
        escrevem coisas de gêneros diferentes: lá a manchete INTEIRA de um cartaz
        que disputa o clique numa lista; aqui o nome do assunto numa prateleira
        onde nove capas são vistas juntas.

        A diferença mais contra-intuitiva está no histórico. Toda a esteira manda
        o passado para EVITAR repetição; aqui ele vai para permiti-la — três
        cortes sobre a Selic devem dizer SELIC, e é essa repetição que faz a
        grade parecer um canal.

        Levanta `LookupError` (corte inexistente). Devolve a etiqueta já
        normalizada; string vazia quando o modelo não produziu nada aproveitável,
        e nesse caso a capa sai sem texto em vez de não sair.
        """
        from app.domain.capa_tiktok import etiqueta_da_resposta
        from app.services import capa_tiktok as capa_store

        contexto = await capa_store.montar_contexto_da_etiqueta(corte_id)

        skill = editorial_skills.resolver_skill(_SKILL_CAPA_TIKTOK)
        scaffold = editorial_scaffolds.resolver_scaffold("capa-tiktok")
        prompt = scaffold.format(
            titulo_proposto=contexto.titulo,
            tema_central=contexto.tema_central,
            resumo=contexto.resumo,
            etiquetas_recentes=contexto.etiquetas_recentes or "(nenhuma ainda)",
        )
        _log_skill_usada(_SKILL_CAPA_TIKTOK, skill, scaffold)
        bruto = await _gerar_text_provider(
            provider,
            prompt,
            skill,
            _SKILL_CAPA_TIKTOK,
            projeto_id=contexto.projeto_id,
            corte_id=corte_id,
        )
        return etiqueta_da_resposta(bruto)

    @staticmethod
    async def prompt_da_capa_do_short_via_claude(
        short_id: str, provider: ProviderIA = "claude"
    ) -> str:
        """O prompt de imagem da capa de um short vertical (D-581).

        Skill separada da capa do TikTok por uma diferenca concreta, e nao por
        organizacao: la a imagem sai SEM texto, porque o sistema desenha a
        etiqueta e o selo por cima com a tipografia do canal. Aqui nao ha
        montagem nenhuma — a capa do short e a imagem inteira —, entao a frase
        precisa nascer dentro da arte, com cor e contorno declarados.

        A outra diferenca e o recorte. A capa do corte vive numa vitrine so; a
        do short aparece em tres, e as duas grades de perfil (Instagram e TikTok)
        mostram apenas o QUADRADO CENTRAL do quadro 9:16. E isso que a skill
        precisa conciliar, e e por isso que ela pensa um pouco mais que a vizinha.

        A cor explicita nao e capricho: a D-343 mediu que 90% dos prompts sem cor
        declarada voltaram com texto branco — e branco sobre fundo claro e uma
        capa que nao diz nada.

        O estilo e herdado do prompt da thumbnail do YouTube quando ele existe,
        pelo motivo da D-524: a identidade do canal em dois corpos de skill e a
        garantia de que um dia os dois discordem.

        NAO grava — quem grava e `capa_short.gerar_prompt`, que e quem sabe onde
        o metadado do short mora.

        Levanta `LookupError` (short inexistente).
        """
        from app.services import capa_short as capa_store

        contexto = await capa_store.montar_contexto_da_capa(short_id)

        skill = editorial_skills.resolver_skill(_SKILL_CAPA_SHORT)
        scaffold = editorial_scaffolds.resolver_scaffold("capa-short-imagem")
        prompt = scaffold.format(
            titulo=contexto.titulo or "(sem titulo)",
            tema_central=contexto.tema_central or "(sem tema)",
            gancho_tela=contexto.gancho_tela or "(este short nao tem gancho escrito)",
            gancho=contexto.gancho_da_curadoria or "(sem nota da curadoria)",
            duracao_humana=contexto.duracao_humana,
            texto_transcricao=contexto.texto_transcricao or "(trecho sem fala transcrita)",
            prompt_thumbnail=contexto.prompt_thumbnail or "(o Capista ainda nao escreveu)",
            texto_capa=capa_store.texto_da_capa(contexto),
        )
        _log_skill_usada(_SKILL_CAPA_SHORT, skill, scaffold)
        bruto = await _gerar_text_provider(
            provider,
            prompt,
            skill,
            _SKILL_CAPA_SHORT,
            projeto_id=contexto.projeto_id,
            corte_id=contexto.corte_id,
            short_id=short_id,
        )
        # D-584: o parser do SHORT, e nao o da capa do TikTok.
        #
        # Aquele exige o literal "no text" na resposta, porque a arte DELE nasce
        # sem texto — o sistema desenha a etiqueta por cima. Aqui e o contrario:
        # a frase nasce DENTRO da imagem, entao um prompt bom nunca contem essa
        # marca. O reuso errado fazia toda geracao voltar 502 dizendo que a
        # skill nao devolveu prompt valido, com um prompt perfeito na mao.
        from app.domain.capa_short import prompt_da_capa

        prompt_valido = prompt_da_capa(bruto)
        if not prompt_valido:
            # D-587: o llm_calls registra a chamada como sucesso, e a recusa
            # acontece depois dele. Sem este aviso, o log diz "deu certo" sobre
            # uma geracao que nunca chegou a tela.
            logger.warning(
                "[CapaShort] short=%s resposta recusada pelo validador (%d chars): %.160r",
                short_id[:8],
                len(bruto or ""),
                bruto,
            )
        return prompt_valido

    @staticmethod
    async def prompt_da_arte_da_capa_via_claude(
        corte_id: str, texto_capa: str, provider: ProviderIA = "claude"
    ) -> str:
        """O prompt de imagem da faixa central da capa do TikTok (D-523, D-524).

        A primeira versão da capa usava um frame do próprio vídeo. Ficou ruim por
        um motivo estrutural: o vídeo é deitado e cheio de texto na tela — um
        documento, um slide —, e nada disso sobrevive à miniatura da grade do
        perfil. Aqui a faixa passa a receber uma cena feita para ser vista
        pequena.

        A imagem nasce SEM texto de propósito: a etiqueta e o selo são desenhados
        por cima, com a tipografia do canal. Gerador de imagem não escreve
        tipografia confiável, e duas camadas de texto brigariam.

        O estilo é herdado, não redescrito: o prompt que o Capista já escreveu
        para a thumbnail do YouTube vai junto como referência. Manter a
        identidade do mascote em dois corpos de skill é garantir que um dia os
        dois discordem — e aí o mesmo canal teria dois personagens.

        Levanta `LookupError` (corte inexistente).
        """
        from app.domain.capa_tiktok import prompt_da_arte
        from app.services import capa_tiktok as capa_store

        contexto = await capa_store.montar_contexto_da_etiqueta(corte_id)

        skill = editorial_skills.resolver_skill(_SKILL_CAPA_TIKTOK_IMAGEM)
        scaffold = editorial_scaffolds.resolver_scaffold("capa-tiktok-imagem")
        prompt = scaffold.format(
            titulo_proposto=contexto.titulo,
            tema_central=contexto.tema_central,
            texto_capa=texto_capa or "(sem etiqueta)",
            resumo=contexto.resumo,
            prompt_thumbnail=contexto.prompt_thumbnail or "(o Capista ainda nao escreveu)",
        )
        _log_skill_usada(_SKILL_CAPA_TIKTOK_IMAGEM, skill, scaffold)
        bruto = await _gerar_text_provider(
            provider,
            prompt,
            skill,
            _SKILL_CAPA_TIKTOK_IMAGEM,
            projeto_id=contexto.projeto_id,
            corte_id=corte_id,
        )
        return prompt_da_arte(bruto)

    @staticmethod
    async def gerar_prompt_thumbnail_via_claude(
        corte_id: str, provider: ProviderIA = "claude"
    ) -> dict:
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
        texto = await _gerar_text_provider(
            provider, prompt, skill, _SKILL_THUMBNAIL, corte_id=corte_id
        )
        prompt_thumbnail = _strip_code_fences(texto)
        if not prompt_thumbnail:
            raise ValueError("Claude não retornou o prompt de thumbnail.")

        await MetadadosService.importar_prompt_thumbnail(corte_id, prompt_thumbnail)
        logger.info("[ClaudeIA] Prompt de thumbnail gerado via Claude p/ corte %s", corte_id[:8])

        # D-525: a capa do TikTok herda deste prompt — mascote, paleta, luz. Só
        # agora ela TEM base, então é aqui que o encadeamento pertence: encostado
        # na gravação, e não num botão que o operador pode clicar antes da hora.
        #
        # Em background porque é acessório: o prompt do YouTube é a entrega desta
        # chamada, e fazer o operador esperar mais uma volta de modelo por causa
        # de uma etiqueta de TikTok inverteria as prioridades. Falhar aqui só
        # custa um clique no botão da capa depois.
        fire_and_forget(
            ClaudeIaService._encadear_prompt_da_capa_tiktok(corte_id),
            name=f"capa-tiktok-prompt-{corte_id[:8]}",
        )
        return {"ok": True}

    @staticmethod
    async def _encadear_prompt_da_capa_tiktok(corte_id: str) -> None:
        """Escreve o prompt da capa do TikTok logo depois do prompt do YouTube."""
        from app.services import capa_tiktok

        try:
            await capa_tiktok.gerar_prompt_da_arte(corte_id)
            logger.info("[ClaudeIA] Prompt da capa do TikTok encadeado p/ %s", corte_id[:8])
        except Exception:
            logger.exception(
                "[ClaudeIA] nao consegui encadear o prompt da capa do TikTok de %s", corte_id[:8]
            )

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
