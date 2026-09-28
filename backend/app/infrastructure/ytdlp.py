"""As linhas de comando do yt-dlp (D-807).

Toda chamada ao yt-dlp nasce aqui. A URL entra reconstruída pelo id
(`url_canonica_do_video`) e depois do `--`, que encerra as opções: o texto que
alguém colou nunca vira argumento. Antes ia cru, e um "URL" `--exec=...` era
opção do yt-dlp — que executa comando (CodeQL py/command-line-injection).
"""

from app.domain.compartilhado.url_do_youtube import url_canonica_do_video


def argv_do_ytdlp(opcoes: list[str], url: str) -> list[str]:
    return ["yt-dlp", *opcoes, "--", url_canonica_do_video(url)]


def argv_do_video(url: str, formato: str, saida: str) -> list[str]:
    """O vídeo, com os metadados em JSON e o progresso linha a linha."""
    opcoes = ["-f", formato, "--output", saida, "--write-info-json", "--newline"]
    return argv_do_ytdlp([*opcoes, "--merge-output-format", "mkv"], url)


def argv_da_legenda(url: str, formato: str, saida: str) -> list[str]:
    """Só a legenda (automática ou enviada), sem baixar o vídeo."""
    opcoes = ["--write-auto-sub", "--write-sub", "--sub-lang", "pt,pt-BR,pt-PT,en"]
    return argv_do_ytdlp(
        [*opcoes, "--sub-format", formato, "--skip-download", "--output", saida], url
    )


def argv_do_chat(url: str, saida: str) -> list[str]:
    """O replay do chat: é a faixa `live_chat` (--write-subs), não a automática."""
    opcoes = ["--write-subs", "--sub-langs", "live_chat", "--skip-download"]
    return argv_do_ytdlp([*opcoes, "--output", saida], url)
