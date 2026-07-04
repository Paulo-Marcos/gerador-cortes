import os

from app.channel_paths import projetos_dir as _channel_projetos_dir
from pydantic_settings import BaseSettings

_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_PROJECT_ROOT = os.path.abspath(os.path.join(_BACKEND_ROOT, ".."))


class Settings(BaseSettings):
    # D-155: dados operacionais vivem na pasta do canal ativo
    # (`instance/channels/<ativo>/projetos`). Fallback ao legado `backend/projetos`
    # — e ainda sobreposto por `PROJETOS_DIR` no .env, como antes.
    projetos_dir: str = str(_channel_projetos_dir())
    assets_dir: str = os.path.join(_BACKEND_ROOT, "assets")
    video_renderer_dir: str = os.path.join(_PROJECT_ROOT, "video-renderer")
    guia_cortes_path: str = os.path.join(_BACKEND_ROOT, "assets", "GUIA_CRIACAO_CORTES.md")

    gemini_api_key: str = ""
    youtube_api_key: str = ""
    ytdlp_format: str = "bestvideo+bestaudio/best"

    # --- Claude CLI (provider alternativo de geração via `claude -p`) ---
    # WHY: usa a assinatura local do Claude (sem API key, sem custo por token).
    # Só funciona no fluxo LOCAL — o binário `claude` não existe no container Docker.
    claude_cli_enabled: bool = True
    claude_cli_path: str = ""  # override do caminho do binário; vazio = resolve no PATH
    claude_cli_cwd: str = ""  # cwd da invocação; vazio = temp (evita herdar CLAUDE.md do projeto)
    claude_cli_timeout: float = 300.0  # trava pendurada falha em até 5 min (era 10)
    # Máximo de chamadas `claude -p` simultâneas. Várias em paralelo (ex.: metadados
    # + cenas no gerar-bruto) batem no limite de concorrência da assinatura e falham
    # com is_error transitório. 1 = serializa (mais seguro).
    claude_cli_max_concurrent: int = 1
    claude_cli_retries: int = (
        4  # tentativas extras em erro transitório (overload/529); backoff exponencial
    )
    # 0 = desabilita o "extended thinking". Prompts com muitas restrições (ex.:
    # cenas: máx N, espaçamento mínimo entre cenas) fazem o modelo raciocinar por
    # MINUTOS sem ganho proporcional. As skills/prompts já são detalhados.
    claude_cli_max_thinking_tokens: int = 0
    # Exceção por QUALIDADE: gerar o prompt de thumbnail é a etapa que mais se
    # beneficia de raciocínio (derivar cenário/roupa/luz sem cardápio, gerar 3
    # hipóteses internas e inverter o eixo saturado). Aqui priorizamos qualidade
    # sobre velocidade — extended thinking ligado SÓ neste caminho. 0 = herda o
    # global (desligado).
    claude_cli_thinking_tokens_thumbnail: int = 10000
    skills_dir: str = os.path.join(_PROJECT_ROOT, ".claude", "skills")
    # Modelos por etapa (alias do CLI: opus | sonnet | haiku, ou nome completo)
    claude_model_analise: str = "opus"
    claude_model_cenas: str = "sonnet"
    claude_model_metadados: str = "sonnet"
    claude_model_thumbnail: str = "opus"
    claude_model_ranking_sentimento: str = "haiku"
    # Janela da memória global anti-repetição de thumbnails: quantas das últimas
    # capas (de QUALQUER projeto, ordenadas por id desc) viram ELEMENTOS
    # PROIBIDOS no prompt. Janela maior = menos recorrência de roupa/cenário/
    # paleta/luz entre vídeos do canal, ao custo de mais restrições no prompt.
    # Era 4 (curto demais — a mesma roupa voltava ao sair da janela).
    thumbnail_anti_repeticao_janela: int = 8
    # Acima deste tamanho estimado de prompt (em chars), a análise vai por lote
    # em vez de mandar a transcrição inteira de uma vez. ~4 chars/token →
    # 480k chars ≈ 120k tokens, deixando folga no contexto de 200k.
    claude_analise_max_chars_direto: int = 480_000
    # Ao gerar/regerar o bruto, gera as cenas via Claude DEPOIS do re-sync da
    # transcrição (silêncios já removidos) — garante timings precisos das cenas.
    claude_auto_cenas_no_bruto: bool = True

    # --- F-052: Ranking de lives candidatas ---
    # Janela de busca inicial. Se o top fica abaixo de `ranking_top` candidatos
    # elegíveis, o serviço EXPANDE para 6, 12, 24m até encher.
    ranking_janela_meses_inicial: int = 3
    ranking_janela_meses_max: int = 24
    ranking_top: int = 20
    ranking_max_comentarios_por_live: int = 30
    ranking_cache_horas: float = 24.0
    ranking_meia_vida_dias: float = 90.0
    ranking_peso_views: float = 0.15
    ranking_peso_likes_por_view: float = 0.10
    ranking_peso_comentarios_por_view: float = 0.15
    ranking_peso_sentimento: float = 0.35
    ranking_peso_recencia: float = 0.25

    # Quando True, o pipeline de geração de bruto imprime no console e
    # grava em `DEBUG_gerar_bruto.log` o detalhamento completo (segmentos
    # calculados, paths dos arquivos auxiliares, cmd ffmpeg dispatched).
    # Útil para investigar problemas; default off para não poluir o log.
    # Ative via env var: `BRUTO_VERBOSE_LOG=1` ou no .env.
    bruto_verbose_log: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # WHY ignore: remover um campo de Settings (ex.: as antigas N8N_*) não pode
        # derrubar o boot de ambientes cujo .env ainda define a variável. Sem isto,
        # pydantic-settings rejeita o env "extra" (extra_forbidden) e o app não sobe.
        extra = "ignore"


settings = Settings()
