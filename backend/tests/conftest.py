"""Configuração global da suíte de testes.

D-622: o render escolhe o encoder testando o hardware (Intel Quick Sync ou
libx264). Os testes fixam `qsv` para não depender da máquina — sem isso, a CI
(sem Intel) escolheria libx264 e mudaria o fluxo de fallback da grade.
Os caminhos do libx264 têm testes próprios que passam o encoder explicitamente.
"""

import os

os.environ["VIDEO_ENCODER"] = "qsv"
