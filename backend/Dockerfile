FROM python:3.11-slim

# Instalar dependências do sistema (ffmpeg, yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Sempre atualiza o yt-dlp para a versão mais recente
# (YouTube muda frequentemente e versões antigas param de funcionar)
RUN pip install -U yt-dlp

COPY . .

# Criar diretórios necessários
RUN mkdir -p /app/projetos /app/assets/intro

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
