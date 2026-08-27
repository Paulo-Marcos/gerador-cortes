r"""Pipeline de geração do vídeo bruto multi-segmento.

Estratégia única: cada segmento marcado pelos desvios é cortado individualmente
(`-c:v libx264 -c:a pcm_s16le`) e depois todos são concatenados via concat
demuxer com flags do **LosslessCut**, validado em produção juntando 79
segmentos em <10s sem drift.

## Histórico (por que esse caminho)

Várias abordagens foram testadas e descartadas:

1. **filter_complex multi-trim + `-ss/-copyts`**: gerava MKV com metadata
   corrompido (ffprobe N/A, player mostrando 3h30 onde deveriam ser 7min).
2. **Concat demuxer + `-c copy`** (sem flags do muxer matroska):
   funcionava, mas tinha drift cumulativo de ~2s a cada 80 parts.
3. **MPEG-TS + concat protocol**: requer h264+AAC nos parts e perdia
   sample accuracy.
4. **filter_complex single-call sem `-ss`**: preciso mas muito lento
   (decodifica do começo do vídeo).
5. **Concat demuxer + re-encode**: lento e introduzia perda visual.

A abordagem atual (LosslessCut-style) é a **única** que entrega:
- Per-segment com PTS contíguo e vídeo ancorado em 0 (`-fps_mode cfr` +
  `-fflags +genpts` + `-avoid_negative_ts make_zero`)
- Concat sem re-encode (`-c:0 copy` por índice, não por tipo)
- Flags defensivas do muxer matroska (`-default_mode infer_no_subs`,
  `-ignore_unknown`, `-disposition:N default`)
- Output sample-exato (709.343s reais para 80 segmentos somando 708.127s
  intended — drift dentro de 1.5s, distribuído como frames extras de
  fim-de-segmento, sem gaps perceptíveis).
"""

from dataclasses import dataclass
from pathlib import Path

from app.domain.time_convert import seg_to_hms

# ─────────────────────────────────────────────────────────────────────────────
# Resultado da construção do pipeline
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class BrutoPipeline:
    """Artefatos pra disparar a geração do bruto.

    - ``files``: mapa de path absoluto → conteúdo dos arquivos auxiliares
      (.bat + concat list).  O caller é responsável por escrevê-los no disco.
    - ``cmd``: comando final a executar via Native Worker.  Sempre
      ``["cmd", "/c", "<job.bat>"]`` — o .bat encapsula todos os ffmpegs
      por-segmento + o concat final.
    - ``tmp_dir``: diretório onde os parts intermediários (.mkv) são
      gerados.  Pode ser limpo após a geração.
    """

    files: dict[Path, str]
    cmd: list[str]
    tmp_dir: Path


# ─────────────────────────────────────────────────────────────────────────────
# Helpers (puros, sem side-effects)
# ─────────────────────────────────────────────────────────────────────────────


_BAT_HEADER = ["@echo off", "chcp 65001 >nul", "setlocal"]
_BAT_CHECK = "if %errorlevel% neq 0 exit /b %errorlevel%"
_BAT_FOOTER = "exit /b %errorlevel%"


def _bat_for(commands: list[str]) -> str:
    """Empacota uma lista de comandos ffmpeg num script .bat windows-safe.

    Cada comando intermediário tem um check de errorlevel que aborta o
    script ao primeiro erro — evita continuar com parts corrompidos.
    """
    lines = list(_BAT_HEADER)
    for cmd in commands[:-1]:
        lines.append(cmd)
        lines.append(_BAT_CHECK)
    lines.append(commands[-1])
    lines.append(_BAT_FOOTER)
    return "\n".join(lines)


def _per_segment_cmd(video_path: Path, seg_i: float, seg_f: float, out_path: Path) -> str:
    """Cmd de corte de um segmento individual.

    Flags-chave:

    - ``-fflags +genpts``: regenera PTSes ausentes.  Defesa em profundidade —
      NÃO resolve sozinho o part que nasce com ``v_start=0.033`` (ver
      `-fps_mode cfr` abaixo): ali os PTSes existem e estão corretos, então
      não há o que sintetizar.
    - ``-ss SEG_I -i video -t DUR``: fast seek + duração exata.
    - ``-c:v libx264 -preset ultrafast``: re-encode necessário porque
      `-c copy` não consegue cortar em pontos não-keyframe.
    - ``-fps_mode cfr``: ancora o vídeo do part na grade de frames a partir de
      0 (D-449).  O `-ss` corta o áudio no instante EXATO pedido, mas o vídeo
      só tem frame a cada 1/fps — em ~40% dos parts o primeiro frame caía em
      0.033 enquanto o áudio começava em 0.000.  O `make_zero` zera o menor
      dos dois (o áudio) e o vídeo ficava 1 frame atrasado DENTRO do part; o
      concat preservava esse vão e a grade (CFR estrito) depois o colapsava,
      encolhendo o vídeo enquanto o áudio seguia contínuo → dessincronia
      progressiva, proporcional ao número de parts (~1,5s em 116 parts).
      Com `cfr` os dois streams nascem em 0.000 e a contagem de frames fecha
      exata; o custo é ≤1 frame de deslocamento por part, LIMITADO e não
      acumulativo.
    - ``-c:a pcm_s16le``: áudio lossless **sem** priming samples (AAC adicionaria
      ~21ms a cada part, acumulando 1-2s em 80 parts).  PCM é convertido pra
      formato final no pipeline de pós-produção.
    - ``-avoid_negative_ts make_zero``: força o primeiro frame a ter DTS=0,
      defesa em profundidade junto com `-fflags +genpts`.
    """
    duracao = seg_f - seg_i
    return (
        f"ffmpeg -y -nostdin -fflags +genpts "
        f'-ss {seg_to_hms(seg_i)} -i "{video_path}" '
        f"-t {seg_to_hms(duracao)} "
        f"-c:v libx264 -preset ultrafast -fps_mode cfr -c:a pcm_s16le "
        f"-avoid_negative_ts make_zero "
        f'"{out_path}"'
    )


def _concat_cmd_losslesscut_style(concat_list_path: Path, out_path: Path) -> str:
    """Cmd de concat final, estilo LosslessCut.

    Flags-chave (validadas em produção):

    - ``-f concat -safe 0 -protocol_whitelist file,pipe,fd``: lê o concat list.
    - ``-map 0:0 -c:0 copy -disposition:0 default``: mapeia o stream 0 (vídeo)
      por **ÍNDICE** com `-c copy` e força disposition consistente.  Usar
      `-c:v copy` em vez disso pode causar problemas se algum part tiver
      mapeamento de stream diferente.
    - ``-map 0:1 -c:1 copy -disposition:1 default``: idem para áudio (stream 1).
    - ``-movflags +faststart``: move o moov atom pro início (streaming-friendly).
    - ``-default_mode infer_no_subs``: muxer matroska não tenta inferir
      defaults baseado em streams de subtítulo (que não existem aqui).
    - ``-ignore_unknown``: ignora qualquer stream desconhecido nos parts.
    - ``-f matroska``: força formato de saída explicitamente.

    **Importantemente NÃO usa**:

    - ``-fflags +genpts`` no concat (PTS já é contíguo nos parts, regenerar
      aqui pode introduzir drift).
    - ``-c:v`` / ``-c:a`` (substituídos pelos mapeamentos por índice).
    """
    return (
        f"ffmpeg -hide_banner "
        f"-f concat -safe 0 -protocol_whitelist file,pipe,fd "
        f'-i "{concat_list_path}" '
        f"-map 0:0 -c:0 copy -disposition:0 default "
        f"-map 0:1 -c:1 copy -disposition:1 default "
        f"-movflags +faststart "
        f"-default_mode infer_no_subs "
        f"-ignore_unknown "
        f"-f matroska -y "
        f'"{out_path}"'
    )


# ─────────────────────────────────────────────────────────────────────────────
# API pública: builder do pipeline
# ─────────────────────────────────────────────────────────────────────────────


def build_bruto_pipeline(
    video_path: Path,
    out_path: Path,
    work_dir: Path,
    tmp_dir: Path,
    segmentos: list[tuple[float, float]],
) -> BrutoPipeline:
    """Constrói os artefatos pra gerar o bruto a partir dos segmentos.

    Args:
        video_path: vídeo de origem (.mkv ou .mp4).
        out_path: arquivo final do bruto (recomendado: nome único por geração).
        work_dir: pasta onde escrever o .bat e a concat list.
        tmp_dir: pasta onde escrever os parts intermediários (.mkv).
        segmentos: lista de (start_seg, end_seg) em coordenadas absolutas do
            vídeo de origem.  Não pode estar vazia.

    Returns:
        BrutoPipeline com os arquivos a escrever (`files`), o comando a
        executar (`cmd`) e o `tmp_dir` usado.

    Raises:
        ValueError: se ``segmentos`` estiver vazio.

    Exemplo:
        >>> p = build_bruto_pipeline(
        ...     Path("video.mkv"), Path("out.mkv"),
        ...     Path("/work"), Path("/tmp/parts"),
        ...     [(100.0, 110.0), (200.0, 215.5)],
        ... )
        >>> p.cmd[0:2]
        ['cmd', '/c']
    """
    if not segmentos:
        raise ValueError("Pelo menos um segmento é obrigatório.")

    parts = [(tmp_dir / f"part_{i:03d}.mkv").resolve() for i in range(len(segmentos))]
    concat_list = work_dir / "concat_list.txt"
    script_path = work_dir / "job_bruto.bat"

    cmds: list[str] = [
        _per_segment_cmd(video_path, seg_i, seg_f, parts[i])
        for i, (seg_i, seg_f) in enumerate(segmentos)
    ]
    cmds.append(_concat_cmd_losslesscut_style(concat_list, out_path))

    concat_content = "\n".join(f"file '{str(p).replace(chr(92), '/')}'" for p in parts)

    return BrutoPipeline(
        files={
            concat_list: concat_content,
            script_path: _bat_for(cmds),
        },
        cmd=["cmd", "/c", script_path.name],
        tmp_dir=tmp_dir,
    )
