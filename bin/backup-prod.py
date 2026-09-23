#!/usr/bin/env python3
"""backup-prod.py — empacota os dados da instalação num zip (D-748).

O código está no GitHub; os dados não estavam em lugar nenhum. Este script fecha
essa lacuna sem parar a aplicação: os bancos são copiados pela API de *backup
online* do SQLite, que tira um retrato consistente de um banco em uso, e o resto
é leitura pura. Roda com a PROD no ar.

Entra o que **não volta sozinho**: os bancos, os assets autorais do canal
(molduras, retratos, mascote) e as capas geradas por IA — arte não determinística
que um novo render não reproduz, e da qual o banco guarda só o caminho.

Fica de fora o que o pipeline refaz (overlays, clip_raw, proxies, legendas, logs,
a live baixada) e o que é **segredo** (`backend/.env`, `client_secrets.json`,
`token.json`): um zip sem senha na nuvem não é lugar para chave de API. O
`RESTAURAR.md` gerado dentro do pacote lista cada ausência e onde recuperá-la.

Uso:
    python bin/backup-prod.py                       # PROD -> OneDrive/Backup/cutcut-prod
    python bin/backup-prod.py --origem C:/PRD/gerador-cortes --destino D:/backups
    python bin/backup-prod.py --sem-capas           # só o essencial (~350 MB)
"""

import argparse
import sqlite3
import sys
import tempfile
import zipfile
from datetime import date
from pathlib import Path

DESTINO_PADRAO = Path.home() / "OneDrive" / "Backup" / "cutcut-prod"
ORIGEM_PADRAO = Path("C:/PRD/gerador-cortes")

# Capas geradas por IA: o render refaz o vídeo, mas não refaz *esta* arte.
CAPAS = {"thumbnail.jpg", "capa.png"}
# Pastas autorais de cada canal, relativas a instance/channels/<canal>/.
AUTORAIS = ("assets", "editorial", "mascot")

RESTAURAR = """# Restaurar este backup

Dados do CutCut empacotados por `bin/backup-prod.py` em {data}, a partir de
`{origem}`.

## O que está aqui

- `settings.db` — configuração e skills editoriais, por canal
- `llm_calls.db` — telemetria das chamadas de IA
- `channels/<canal>/projetos/projetos.db` — projetos, cortes, metadados, transcrições
- `channels/<canal>/assets/` — molduras das capas, retratos, mascote
- `channels/<canal>/editorial/` — skills .md (reserva; as vigentes vivem no settings.db)
- `channels/<canal>/projetos/.../thumbnail.jpg` e `capa.png` — as capas geradas
  por IA, que um novo render não reproduz

## O que não está aqui, de propósito

**Segredos.** Depois de restaurar, recrie `backend/.env` a partir de
`backend/.env.example`. As chaves que precisam de valor real:

- `GEMINI_API_KEY` — Google AI Studio
- `YOUTUBE_API_KEY` — Google Cloud Console, projeto do canal
- `HUGGINGFACE_TOKEN` — huggingface.co/settings/tokens

E também `backend/client_secrets.json` (baixe de novo no Google Cloud Console) e
`instance/channels/<canal>/youtube/token.json`, que se refaz sozinho no primeiro
"Conectar conta do YouTube" pela tela.

**Mídia derivada:** overlays .mov, clip_raw, proxies, legendas, logs — o pipeline
refaz. A live baixada (`video.mkv`) também não veio: o yt-dlp baixa de novo
enquanto ela existir no YouTube.

**Perfil do Chrome** (`channels/<canal>/browser/`): são sessões logadas do TikTok
e do Instagram, pesadas e sensíveis. Restaurar = logar de novo nos dois.

## Como restaurar

1. Pare a aplicação.
2. Descompacte por cima de `<instalação>/instance/`.
3. Recrie os segredos da lista acima.
4. Suba e confira: a lista de projetos carrega e um corte publicado mostra a capa.
"""


def snapshot(origem: Path, destino: Path) -> None:
    """Copia um SQLite em uso e recusa o resultado se ele não passar no integrity_check."""
    try:
        fonte = sqlite3.connect(f"file:{origem.as_posix()}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        fonte = sqlite3.connect(origem.as_posix())
    try:
        copia = sqlite3.connect(destino.as_posix())
        try:
            with copia:
                fonte.backup(copia)
            veredito = copia.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            copia.close()
    finally:
        fonte.close()
    if veredito != "ok":
        raise SystemExit(f"FALHA: {origem} nao passou no integrity_check ({veredito})")


def _canais(instance: Path) -> list[Path]:
    return sorted(p for p in (instance / "channels").glob("*") if p.is_dir())


def bancos(instance: Path) -> list[tuple[Path, str]]:
    """Os bancos globais e o banco de projetos de cada canal, com o nome que terão no zip."""
    achados = [(db, db.name) for db in sorted(instance.glob("*.db"))]
    for canal in _canais(instance):
        db = canal / "projetos" / "projetos.db"
        if db.exists():
            achados.append((db, f"channels/{canal.name}/projetos/projetos.db"))
    return achados


def autorais(instance: Path) -> list[tuple[Path, str]]:
    """Assets, skills e identidade de cada canal — feitos à mão, não gerados."""
    achados: list[tuple[Path, str]] = []
    marcador = instance / "active-channel"
    if marcador.exists():
        achados.append((marcador, "active-channel"))
    for canal in _canais(instance):
        yaml = canal / "channel.yaml"
        if yaml.exists():
            achados.append((yaml, f"channels/{canal.name}/channel.yaml"))
        for nome in AUTORAIS:
            pasta = canal / nome
            if not pasta.is_dir():
                continue
            for arquivo in sorted(pasta.rglob("*")):
                if arquivo.is_file() and "__pycache__" not in arquivo.parts:
                    rel = arquivo.relative_to(pasta).as_posix()
                    achados.append((arquivo, f"channels/{canal.name}/{nome}/{rel}"))
    return achados


def capas(instance: Path) -> list[tuple[Path, str]]:
    """As capas geradas por IA, espalhadas pelas pastas de projeto."""
    achados: list[tuple[Path, str]] = []
    for canal in _canais(instance):
        raiz = canal / "projetos"
        if not raiz.is_dir():
            continue
        for arquivo in raiz.rglob("*"):
            if arquivo.is_file() and arquivo.name in CAPAS:
                rel = arquivo.relative_to(raiz).as_posix()
                achados.append((arquivo, f"channels/{canal.name}/projetos/{rel}"))
    return achados


def _mb(itens: list[tuple[Path, str]]) -> float:
    return sum(p.stat().st_size for p, _ in itens) / 1024 / 1024


def empacotar(origem: Path, destino: Path, com_capas: bool = True) -> Path:
    """Monta o zip e só devolve o caminho depois que ele passa no testzip."""
    instance = origem / "instance"
    if not instance.is_dir():
        raise SystemExit(f"FALHA: {instance} nao existe - --origem aponta para a instalacao?")

    destino.mkdir(parents=True, exist_ok=True)
    pacote = destino / f"cutcut-prod-{date.today().isoformat()}.zip"
    print(f"origem : {origem}  (nao sera parada)")

    with tempfile.TemporaryDirectory() as tmp:
        retratos: list[tuple[Path, str]] = []
        for db, nome in bancos(instance):
            copia = Path(tmp) / nome.replace("/", "_")
            snapshot(db, copia)
            mb = copia.stat().st_size / 1024 / 1024
            print(f"  banco  {nome:<46} {mb:9.1f} MB  integridade=ok")
            retratos.append((copia, nome))

        feitos_a_mao = autorais(instance)
        imagens = capas(instance) if com_capas else []
        print(f"  canal  {'assets, editorial, mascote':<46} {_mb(feitos_a_mao):9.1f} MB  {len(feitos_a_mao):5} arq")
        print(f"  capas  {'thumbnail.jpg + capa.png':<46} {_mb(imagens):9.1f} MB  {len(imagens):5} arq")

        with zipfile.ZipFile(pacote, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for caminho, nome in retratos + feitos_a_mao + imagens:
                z.write(caminho, nome)
            z.writestr("RESTAURAR.md", RESTAURAR.format(data=date.today().isoformat(), origem=origem))

    with zipfile.ZipFile(pacote) as z:
        corrompida = z.testzip()
        if corrompida is not None:
            raise SystemExit(f"FALHA: entrada corrompida no pacote: {corrompida}")
        entradas = len(z.infolist())

    mb = pacote.stat().st_size / 1024 / 1024
    print(f"\npacote : {pacote}\ntamanho: {mb:.1f} MB em {entradas} entradas")
    return pacote


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Empacota os dados da instalacao num zip.")
    parser.add_argument(
        "--origem",
        type=Path,
        default=ORIGEM_PADRAO,
        help="raiz da instalacao a salvar (padrao: a PROD)",
    )
    parser.add_argument(
        "--destino",
        type=Path,
        default=DESTINO_PADRAO,
        help=f"pasta onde o zip e gravado (padrao: {DESTINO_PADRAO})",
    )
    parser.add_argument(
        "--sem-capas",
        action="store_true",
        help="so o essencial: bancos e assets, sem as capas geradas por IA",
    )
    args = parser.parse_args(argv)
    empacotar(args.origem.resolve(), args.destino, com_capas=not args.sem_capas)
    return 0


if __name__ == "__main__":
    sys.exit(main())
