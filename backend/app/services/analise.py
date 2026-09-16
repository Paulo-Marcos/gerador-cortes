"""
Serviço de Análise — gera cortes via Claude e os salva no projeto
"""

import json
import uuid
from datetime import datetime

from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.ancora_match import achatar_palavras, ancorar_intervalo
from app.domain.manual_prompt import pedir_resposta_json_em_bloco_codigo
from app.domain.segment_calculator import normalizar_desvio as _normalizar_desvio
from app.domain.time_convert import hms_to_seg, seg_to_hms
from app.models import Corte, CorteSnapshot, Projeto, StatusProjeto
from app.services.app_logging import operational_info
from sqlalchemy import select as sa_select

# D-355: janela (em segundos) para ancorar a borda de CORTE na palavra citada.
# Ampla porque o timestamp do LLM é "de memória" e erra por dezenas de segundos;
# a busca janelada ainda evita casar frase repetida em outro ponto da live.
_JANELA_ANCORA_CORTE_SEG = 60.0


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


def _to_seg(val) -> float:
    """Converte valor para float (segundos), suportando HH:MM:SS."""
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(val)
    except (ValueError, TypeError):
        return hms_to_seg(str(val))


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


PROMPT_ANALISE_TRANSCRICAO = """\
Voce e um editor de video especializado em conteudo analitico e intelectual para YouTube.
Sua tarefa e analisar a transcricao de uma live e identificar cortes tematicamente coerentes.
{guia_section}
=== ETAPA 0: FILTRO EDITORIAL (OBRIGATORIO ANTES DE QUALQUER CORTE) ===

Antes de criar qualquer corte, voce deve classificar os trechos da transcricao.

Classifique cada bloco de conteudo como:

1. RECOMENDADO
2. NAO_RECOMENDADO

CRITERIOS:

✅ RECOMENDADO:
- Analises politicas, sociologicas ou filosoficas profundas
- Explicacoes estruturadas de conceitos
- Argumentacoes com tese + desenvolvimento + conclusao
- Criticas a ideias, sistemas ou figuras publicas (foco intelectual, nao pessoal)

🚫 NAO_RECOMENDADO:
- Desabafos pessoais, emocionais ou de saude
- Discussao com chat ao vivo (bate-boca, respostas irritadas)
- Tretas com influenciadores/youtubers
- Historias constrangedoras, escatologicas ou fora do tom intelectual
- Trechos sem densidade analitica

REGRAS IMPORTANTES:
- Se um trecho inteiro for NAO_RECOMENDADO, ele NAO deve virar corte
- Ele pode existir apenas como DESVIO dentro de um corte valido (se for curto)
- Se um tema for totalmente NAO_RECOMENDADO, liste no campo "descartados"

ANTES DE CONTINUAR:
- Identifique mentalmente quais blocos sao aproveitaveis
- Ignore completamente blocos NAO_RECOMENDADOS na criacao dos cortes
=== REGRAS CRITICAS (siga exatamente) ===

1. IGNORAR INTRO E ENCERRAMENTO COM MUSICA:
   - Lives geralmente iniciam com musica/vinheta de abertura nos primeiros minutos.
   - Lives geralmente terminam com musica de encerramento nos ultimos minutos.
   - Identifique essas partes por: ausencia de fala, texto como [Musica], [Music], simbolos musicais (♪ ♫), segmentos sem conteudo textual, ou fala muito curta intercalada com silencios.
   - O PRIMEIRO corte deve comecar somente quando a fala substantiva e continua iniciar.
   - O ULTIMO corte deve terminar ANTES da musica final.
   - Nunca inclua segmentos de musica dentro de nenhum corte.

2. DESVIO vs TEMA SEPARADO (regra mais importante):
   - Um DESVIO e uma digressao BREVE (menos de 8 minutos) que interrompe o tema principal temporariamente.
   - Se um trecho que parece um desvio dura MAIS DE 8 MINUTOS, ele NAO e um desvio — e um TEMA SEPARADO.
   - Nesse caso, DIVIDA em dois cortes independentes: um antes e um novo corte para esse tema.
   - NUNCA crie um corte onde o total dos desvios supere 30% da duracao do corte.
   - Se o corte ficaria gigante (mais de 40 min) com desvio enorme, prefira dividir em 2 ou 3 cortes menores.
   - Desvios NAO_RECOMENDADOS (chat, treta, etc) devem SEMPRE ser removidos ou marcados
   - Desvios RECOMENDADOS (ex: exemplo filosofico paralelo) podem permanecer se agregarem valor
   - Se um desvio quebra o ritmo intelectual, ele deve ser marcado obrigatoriamente

3. COERENCIA TEMATICA:
   - Cada corte deve ter UMA tese ou argumento central claro e fechado.
   - O corte comeca com a apresentacao da tese/problema e termina com conclusao ou fechamento.
   - Nunca quebre um raciocinio no meio — sempre complete o pensamento antes de encerrar.
   - Temas distintos = cortes distintos, mesmo que o apresentador nao faça pausa explicita.

4. DURACAO:
   - Minimo absoluto: 8 minutos.
   - Maximo absoluto: 35 minutos.
   - Ideal para YouTube: 12 a 22 minutos (formato video-essay).
   - Prefira varios cortes medios a um corte gigante com muitos desvios.

5. TITULO E METADADOS:
   - Titulo estilo ensaio analitico (ex: "Por que o fimdomundismo paralisa a acao politica").
   - Sem clickbait, sem letras maiusculas exageradas, menos de 70 caracteres.
   - Resumo: 2-3 frases descrevendo o arco de raciocinio, NAO o roteiro.
   - Tema central: conceito filosofico/politico/historico central do corte.

6. TIMESTAMPS:
   - Use os timestamps exatos da transcricao para inicio_hms e fim_hms.
   - Calcule inicio_seg e fim_seg em segundos totais (HH*3600 + MM*60 + SS).
   - Desvios tambem precisam de inicio_hms, fim_hms e motivo claro.

7. ARCO NARRATIVO (OBRIGATORIO):
   - Cada corte deve seguir obrigatoriamente:
     1. Introducao da tese
     2. Desenvolvimento (argumentos, exemplos, referencias)
     3. Conclusao ou fechamento logico
   - NUNCA gere cortes baseados apenas em frases soltas ou momentos isolados
   - Priorize blocos longos e coesos (5 a 20 minutos)
   - Se o raciocinio continuar, NAO corte no meio

REGRAS DE SEGURANCA:
- NAO invente timestamps
- NAO invente cortes que nao existem na transcricao
- TODOS os cortes devem corresponder a trechos reais
- Se nao houver conteudo suficiente, retorne poucos cortes (ou nenhum)

FORMATO DE RESPOSTA - retorne APENAS o JSON abaixo, sem markdown, sem explicacoes, sem texto antes ou depois:
{{
  "cortes": [
    {{
      "titulo_proposto": "titulo estilo ensaio analitico",
      "resumo": "2-3 frases sobre o arco de raciocinio",
      "tema_central": "conceito central",
      "inicio_hms": "HH:MM:SS",
      "fim_hms": "HH:MM:SS",
      "inicio_seg": 0,
      "fim_seg": 0,
      "desvios": [
        {{ "inicio_hms": "HH:MM:SS", "fim_hms": "HH:MM:SS", "motivo": "descricao breve do desvio" }}
      ]
    }}
  ]
}}

Titulo da Live: {titulo_live}
Duracao Total: {duracao_h}h{duracao_m}m
URL: {youtube_url}

=== TRANSCRICAO (com timestamps) ===
{transcricao_texto}
=== FIM DA TRANSCRICAO ===

- Removi completamente abertura e encerramento com musica?
- Ignorei completamente temas NAO_RECOMENDADOS?
- Algum corte tem apenas conteudo fraco ou irrelevante?
- Todos os cortes possuem tese + desenvolvimento + conclusao?
- Existe algum desvio maior que 8 min que nao foi separado?
- Todos os cortes estao entre 8 e 35 minutos?
- Marquei corretamente os desvios?
- Listei os trechos descartados?
- todo desvio foi registrado?

Se qualquer resposta for NAO, corrija antes de gerar o JSON.

Agora gere a lista de cortes em JSON puro:"""


class AnaliseService:
    @staticmethod
    async def montar_prompt(projeto_id: str) -> dict:
        """Retorna uma lista de prompts divididos em chunks para análise manual."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto or not projeto.transcricao_raw:
                raise ValueError("Projeto não encontrado ou sem transcrição")

        transcricao = json.loads(projeto.transcricao_raw)
        guia = AnaliseService._ler_guia()
        guia_section = f"=== GUIA EDITORIAL ===\n{guia}\n=== FIM DO GUIA ===\n\n" if guia else ""

        duracao_total = projeto.duracao_segundos or 0
        duracao_h = duracao_total // 3600
        duracao_m = (duracao_total % 3600) // 60

        from app.domain.chunker import fatiar_transcricao
        from app.domain.transcricao_utils import (
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
                inicio_hms = seg_to_hms_short(_to_seg(inicio))
                texto = seg.get("texto", seg.get("text", "")).strip()
                if texto:
                    idx_global = seg.get("global_index", 0)
                    linhas.append(f"[{idx_global}] ({inicio_hms}) {texto}")

            transcricao_texto = "\n".join(linhas)

            # Adiciona o cabeçalho indicando a parte
            cabecalho_parte = f"*** ATENÇÃO: Esta é a PARTE {i + 1} de {len(chunks)} da transcrição. Avalie e retorne os cortes apenas deste trecho. ***\n\n"

            prompt_chunk = cabecalho_parte + PROMPT_ANALISE_TRANSCRICAO.format(
                guia_section=guia_section,
                titulo_live=projeto.titulo_live or "",
                duracao_h=duracao_h,
                duracao_m=duracao_m,
                youtube_url=projeto.youtube_url or "",
                transcricao_texto=transcricao_texto,
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
            seg_inicio = _to_seg(seg.get("inicio", seg.get("start", 0)))
            seg_fim = _to_seg(seg.get("fim", seg.get("end", 0)))
            if seg_fim >= inicio_seg and seg_inicio <= fim_seg:
                transcricao_intervalo.append(seg)

        if not transcricao_intervalo:
            raise ValueError(
                f"Nenhuma transcrição encontrada no intervalo {inicio_seg}s – {fim_seg}s"
            )

        from app.domain.chunker import fatiar_transcricao
        from app.domain.time_convert import seg_to_hms_short
        from app.domain.transcricao_utils import (
            dividir_segmentos_longos,
            limpar_e_ordenar_transcricao,
        )

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

        duracao_h = int((fim_seg - inicio_seg) // 3600)
        duracao_m = int(((fim_seg - inicio_seg) % 3600) // 60)

        guia = AnaliseService._ler_guia()
        guia_section = f"=== GUIA EDITORIAL ===\n{guia}\n=== FIM DO GUIA ===\n\n" if guia else ""

        prompts = []
        for i, chunk in enumerate(chunks):
            linhas = []
            for seg in chunk:
                inicio = seg.get("inicio", seg.get("start", 0))
                inicio_hms = seg_to_hms_short(_to_seg(inicio))
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
                f"*** ATENÇÃO: Esta é a PARTE {i + 1} de {len(chunks)} "
                f"do INTERVALO SELECIONADO do vídeo. "
                f"Intervalo desta parte: {seg_to_hms_short(parte_inicio)} ate {seg_to_hms_short(parte_fim)}. "
                f"Gere os cortes apenas para esta parte. ***\n\n"
            )

            prompt_chunk = cabecalho + PROMPT_ANALISE_TRANSCRICAO.format(
                guia_section=guia_section,
                titulo_live=projeto.titulo_live or "",
                duracao_h=duracao_h,
                duracao_m=duracao_m,
                youtube_url=projeto.youtube_url or "",
                transcricao_texto=texto_chunk,
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
                if _to_seg(seg.get("fim", seg.get("end", 0))) >= bloco_inicio
                and _to_seg(seg.get("inicio", seg.get("start", 0))) <= bloco_fim
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
            _to_seg(seg.get("inicio", seg.get("start", inicio_seg))) for seg in chunk
        )
        parte_fim = max(_to_seg(seg.get("fim", seg.get("end", fim_seg))) for seg in chunk)
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
                projeto.status = StatusProjeto.ANALISADO
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
        # Import local: claude_ia importa este módulo no topo (evita ciclo).
        from app.services.claude_ia import ClaudeIaService

        try:
            await ClaudeIaService.analisar_via_claude(projeto_id)
        except Exception as e:
            async with AsyncSessionLocal() as db:
                projeto = await db.get(Projeto, projeto_id)
                if projeto:
                    projeto.status = StatusProjeto.ERRO
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

        # Import local: claude_ia importa este módulo no topo (evita ciclo).
        from app.services.claude_ia import ClaudeIaService, _mapa_falantes_para_meta

        # D-299: mesma injeção de rótulo [CANAL]/[OUTRO] que a análise completa
        # (D-286) já faz — aqui sempre que o projeto estiver diarizado, sem
        # toggle (a análise de intervalo não expõe `usar_diarizacao`).
        meta = {
            "titulo_live": projeto.titulo_live or "",
            "youtube_url": projeto.youtube_url or "",
            "duracao_segundos": projeto.duracao_segundos or 0,
            "falantes_map": _mapa_falantes_para_meta(projeto.falantes_map),
        }
        resultado = await ClaudeIaService._gerar_cortes(transcricao_intervalo, meta)

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
                if inicio_seg is None or _to_seg(inicio_seg or 0.0) == 0.0:
                    inicio_seg = hms_to_seg(corte_data.get("inicio_hms", "00:00:00"))
                else:
                    inicio_seg = _to_seg(inicio_seg)

                fim_seg = corte_data.get("fim_seg")
                if fim_seg is None or _to_seg(fim_seg or 0.0) == 0.0:
                    fim_seg = hms_to_seg(corte_data.get("fim_hms", "00:00:00"))
                else:
                    fim_seg = _to_seg(fim_seg)

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
    def _ler_guia() -> str:
        """Lê o GUIA_CRIAÇÃO_CORTES.md (guia editorial dos cortes)."""
        # WHY: usa settings.guia_cortes_path em vez de paths Docker hardcoded
        try:
            with open(settings.guia_cortes_path, encoding="utf-8") as f:
                return f.read()
        except FileNotFoundError:
            return ""  # Fallback: sem guia no disco; a expertise da skill basta
