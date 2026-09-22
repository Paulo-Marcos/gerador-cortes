# ADR-0008: Plataforma-alvo — Windows

- **Status:** Aceito
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos

## Contexto

O app só funciona de ponta a ponta no Windows: os scripts de subida são PowerShell
e VBScript (`dev.ps1`, `iniciar-app.ps1`, `iniciar-app.vbs`), a aceleração de vídeo
usa a iGPU Intel (QSV), "abrir a pasta" usa `os.startfile`, e o upload assistido
pilota o Chrome local. O CI, porém, roda em Linux, e nada declarava qual plataforma
a release suporta.

## Decisão

**Windows é a única plataforma suportada oficialmente.** Linux, macOS e Docker ficam
**não suportados**: podem funcionar em parte, sem garantia nem suporte.

## Consequências

- A documentação de instalação é escrita para Windows.
- **O vídeo não depende da iGPU**: o detector de encoder
  (`infrastructure/encoder_detector.py`) só aceita o QSV se um encode de teste
  sair de fato, e cai no `libx264` (CPU) caso contrário. `VIDEO_ENCODER=qsv|libx264`
  força a escolha.
- O CI em Linux continua valendo para o que não depende de plataforma (testes,
  lint, contratos). Ele **não** exercita os scripts de subida, o QSV nem o Chrome;
  um job em `windows-latest` é a forma de cobrir isso, se fizer falta.
- O `docker-compose.yml` não é caminho de instalação suportado.

## Alternativas consideradas

- **Windows oficial, Linux em esforço:** dobra o que precisa ser testado e
  documentado sem ninguém pedindo Linux.

## Gatilho de revisão

Um pedido real de uso em Linux ou macOS, com alguém disposto a testar.
