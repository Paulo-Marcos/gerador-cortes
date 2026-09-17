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

    gemini_api_key: str = ""
    # D-376: sem timeout, uma chamada Gemini lenta/travada (medido: 71s num
    # prompt de 20s de transcrição) prende a criação manual de corte
    # indefinidamente — o usuário via o corte "criando" para sempre.
    gemini_timeout_seg: float = 120.0
    youtube_api_key: str = ""
    ytdlp_format: str = "bestvideo+bestaudio/best"

    # --- Claude CLI (provider alternativo de geração via `claude -p`) ---
    # WHY: usa a assinatura local do Claude (sem API key, sem custo por token).
    # Só funciona no fluxo LOCAL — o binário `claude` não existe no container Docker.
    claude_cli_enabled: bool = True
    claude_cli_path: str = ""  # override do caminho do binário; vazio = resolve no PATH
    claude_cli_cwd: str = ""  # cwd da invocação; vazio = temp (evita herdar CLAUDE.md do projeto)
    claude_cli_timeout: float = 300.0  # trava pendurada falha em até 5 min (era 10)
    # D-300: a etapa Propor cortes ganhou thinking estendido (acima) — thinking
    # aumenta latência, então essa etapa precisa de mais fôlego que o timeout
    # global antes de ser considerada travada.
    claude_cli_timeout_analise: float = 600.0
    # Máximo de chamadas `claude -p` simultâneas. Várias em paralelo (ex.: metadados
    # + cenas no gerar-bruto) batem no limite de concorrência da assinatura e falham
    # com is_error transitório. 1 = serializa (mais seguro).
    claude_cli_max_concurrent: int = 1
    claude_cli_retries: int = (
        4  # tentativas extras em erro transitório (overload/529); backoff exponencial
    )
    # 0 = desabilita o "extended thinking". Usado hoje só por cenas/metadados:
    # prompts com muitas restrições (ex.: cenas: máx N, espaçamento mínimo entre
    # cenas) fazem o modelo raciocinar por MINUTOS sem ganho proporcional.
    claude_cli_max_thinking_tokens: int = 0
    # D-300: Propor cortes é a etapa de MAIOR julgamento editorial (ler a live
    # inteira e decidir onde começa/termina cada corte, título e tema) — merece
    # raciocínio estendido tanto quanto a thumbnail.
    claude_cli_thinking_tokens_analise: int = 12000
    # D-300: Trechos a remover (desvios) também se beneficia de raciocínio, mas
    # em escala menor — revisa só UM corte já recortado, não a live inteira.
    claude_cli_thinking_tokens_trechos: int = 4000
    # Exceção por QUALIDADE: gerar o prompt de thumbnail é a etapa que mais se
    # beneficia de raciocínio (derivar cenário/roupa/luz sem cardápio, gerar 3
    # hipóteses internas e inverter o eixo saturado). Aqui priorizamos qualidade
    # sobre velocidade — extended thinking ligado SÓ neste caminho. 0 = herda o
    # global (desligado).
    claude_cli_thinking_tokens_thumbnail: int = 10000
    # D-447: avaliar o bruto é julgar um texto já pronto contra um roteiro fixo
    # (as emendas marcadas) — pede menos raciocínio que propor os cortes, e roda
    # a cada geração de bruto, então economia importa.
    claude_cli_thinking_tokens_avaliacao: int = 3000
    # D-453: propor shorts julga um texto que JA passou pela curadoria humana —
    # o trabalho e achar bordas auto-contidas, nao decidir o que presta. Pede mais
    # raciocinio que avaliar o bruto (que segue um roteiro fixo) e bem menos que
    # propor cortes (que le a live inteira).
    claude_cli_thinking_tokens_shorts: int = 6000
    claude_cli_thinking_tokens_cenas_short: int = 3000
    # D-520: a etiqueta da capa do TikTok sao 2-3 palavras. O trabalho e de
    # ESCOLHA, nao de redacao: ler o tema e nomear o assunto. Thinking alto aqui
    # so produziria justificativa para um texto de tres palavras.
    claude_cli_thinking_tokens_capa_tiktok: int = 1500
    claude_cli_thinking_tokens_capa_tiktok_imagem: int = 4000
    # D-581: a capa do short pensa um pouco mais que a do TikTok — ela tem de
    # conciliar tres recortes diferentes no mesmo quadro, e nao so compor uma
    # faixa que o sistema vai emoldurar depois.
    claude_cli_thinking_tokens_capa_short: int = 5000
    # D-565: o gancho sao 4-7 palavras, mas o trabalho NAO e de escolha como o
    # da etiqueta da capa: e preciso ler a transcricao do trecho e achar o
    # angulo que prende — e conferir se a promessa esta mesmo la. Por isso o
    # dobro do thinking da etiqueta, ainda longe do custo de propor cortes.
    claude_cli_thinking_tokens_gancho_short: int = 3000
    # D-565: o post do short e redacao curta sobre um trecho ja recortado, e o
    # peso editorial mora na skill. Mesmo patamar do gancho.
    claude_cli_thinking_tokens_metadados_short: int = 3000
    # --- Antigravity CLI (`agy -p`): o provider "Gemini" pela assinatura Google ---
    # Mesmo papel do `claude -p`: login da conta, sem API key. Ver
    # `infrastructure/antigravity_cli_client.py` para o protocolo medido.
    agy_cli_path: str = ""  # vazio = PATH ou %LOCALAPPDATA%\agy\bin\agy.exe
    agy_cli_timeout: float = 300.0
    # 1 = serializa: cada chamada já gasta ~37k tokens fixos da cota.
    agy_cli_max_concurrent: int = 1
    agy_cli_retries: int = 1
    # Modelo Gemini padrão de cada skill, derivado da faixa do modelo Claude dela:
    # Haiku (rapidez) → rápido; Opus/Sonnet (qualidade) → qualidade. Editável por
    # skill na tela de Canais.
    agy_model_qualidade: str = "gemini-3.1-pro-high"
    agy_model_rapido: str = "gemini-3.8-flash-medium"
    skills_dir: str = os.path.join(_PROJECT_ROOT, ".claude", "skills")
    # Modelos por etapa (alias do CLI: opus | sonnet | haiku, ou nome completo)
    claude_model_analise: str = "opus"
    claude_model_cenas: str = "sonnet"
    claude_model_metadados: str = "sonnet"
    claude_model_thumbnail: str = "opus"
    claude_model_ranking_sentimento: str = "haiku"
    claude_model_avaliacao: str = "sonnet"
    # D-453: roda a cada bruto de corte Fire, sobre texto ja curado — sonnet da
    # conta e mantem o custo da esteira baixo.
    claude_model_shorts: str = "sonnet"
    claude_model_cenas_short: str = "sonnet"
    # D-520: nomear o assunto de um corte ja resumido cabe no modelo mais barato.
    claude_model_capa_tiktok: str = "haiku"
    # D-523: escrever a cena da capa e trabalho de capista, nao de etiqueta —
    # mesmo peso que o prompt da thumbnail do YouTube.
    claude_model_capa_tiktok_imagem: str = "sonnet"
    # D-581: o capista da capa do short. Mesmo default dos vizinhos — a etapa e
    # de redacao curta sobre material que ja veio mastigado.
    claude_model_capa_short: str = "sonnet"
    # D-565: escrever o gancho e redacao curta sobre um texto que ja veio
    # recortado — sonnet da conta, e esta etapa roda uma vez por candidato.
    claude_model_gancho_short: str = "sonnet"
    claude_model_metadados_short: str = "sonnet"
    # D-454: faixa que o operador aceita num candidato a short. 15-30s serve
    # Reels, ate 90s serve conteudo denso; abaixo de 15 nao entrega ideia e acima
    # de 90 e o corte de novo. A quantidade e TETO de trabalho, nao cota: a skill
    # manda explicitamente nao encher linguica para bater o numero.
    shorts_duracao_min_seg: float = 15.0
    shorts_duracao_max_seg: float = 90.0
    shorts_quantidade_min: int = 5
    shorts_quantidade_max: int = 8
    # D-455: disparo automatico da fabrica de shorts ao fim do bruto de um corte
    # Fire. Kill-switch no mesmo espirito de `claude_auto_cenas_no_bruto` — a
    # etapa e derivada, entao precisa poder ser desligada sem tocar em codigo.
    claude_auto_shorts_no_bruto: bool = True
    # D-461: transcricao fiel do short por ASR local. Desligado por padrao
    # porque a lib (`pip install faster-whisper`) e o modelo sao opcionais e
    # pesados; sem ela a auto-legenda do YouTube assume, com grafia pior.
    asr_local_habilitado: bool = False
    asr_modelo: str = "small"
    asr_idioma: str = "pt"
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
    # Filosofia do dono (D-356): engajamento genuíno > audiência bruta. Ordem de
    # prioridade — positividade + volume de comentários > likes (%views) > recência
    # > VPH (momento) > views. Editáveis por canal (D-351); estes são só o default.
    ranking_peso_sentimento: float = 0.30
    ranking_peso_comentarios_por_view: float = 0.25
    ranking_peso_likes_por_view: float = 0.15
    ranking_peso_recencia: float = 0.12
    ranking_peso_vph: float = 0.10
    ranking_peso_views: float = 0.08

    # --- D-286: Diarização de falantes (canal vs. reagidos) ---
    # Opt-in: a diarização (pyannote.audio) só roda quando disparada na tela de
    # análise. Precisa de um token gratuito do HuggingFace (com os termos do
    # modelo aceitos). Sem token/lib → o serviço degrada e a transcrição segue
    # sem rótulo de falante, exatamente como hoje.
    huggingface_token: str = ""
    diarizacao_modelo: str = "pyannote/speaker-diarization-3.1"

    # Quando True, o pipeline de geração de bruto imprime no console e
    # grava em `DEBUG_gerar_bruto.log` o detalhamento completo (segmentos
    # calculados, paths dos arquivos auxiliares, cmd ffmpeg dispatched).
    # Útil para investigar problemas; default off para não poluir o log.
    # Ative via env var: `BRUTO_VERBOSE_LOG=1` ou no .env.
    bruto_verbose_log: bool = False
    # Porta do Remotion STUDIO (ferramenta de desenvolvimento, aberta pelo botao
    # "Studio Remotion" do editor). Precisa ficar FORA da faixa 3000-3100, que e
    # onde o `@remotion/renderer` sobe o servidor HTTP que serve o bundle durante
    # o render (`serve-static.js`: `from: 3000, to: 3100`) — faixa hardcoded no
    # pacote, nao configuravel. Com o Studio dentro dela havia corrida: o render
    # testa se a porta esta livre e so DEPOIS faz o bind, entao com o Studio
    # subindo a 3000 aparecia livre, o render a escolhia, e o rebuild do Studio
    # derrubava a conexao (`ERR_CONNECTION_RESET at localhost:3000/index.html`).
    # Deve casar com `$RemotionPort` do dev.ps1.
    remotion_studio_port: int = 3200
    # D-624: origem pela qual o Remotion e o player alcançam o backend (URLs de
    # vídeo e de retrato montadas no servidor). Default = porta padrão; um backend
    # em outra porta (ex.: DEV em 8001) recebe BACKEND_PUBLIC_URL do dev.ps1 —
    # antes, fixo em 8000, o DEV carregava mídia da produção.
    backend_public_url: str = "http://localhost:8000"
    # D-626: porta local que captura o retorno do login OAuth do YouTube. 8080 é
    # a histórica (clientes "Desktop app" aceitam qualquer porta de loopback);
    # troque se outro programa a ocupar.
    youtube_oauth_port: int = 8080

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # WHY ignore: remover um campo de Settings (ex.: as antigas N8N_*) não pode
        # derrubar o boot de ambientes cujo .env ainda define a variável. Sem isto,
        # pydantic-settings rejeita o env "extra" (extra_forbidden) e o app não sobe.
        extra = "ignore"


settings = Settings()
