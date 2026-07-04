FROM python:3.11-slim

# Instalar dependências do sistema (ffmpeg, yt-dlp, Node.js, e libs pro Remotion/Chromium)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    gnupg \
    libnss3 libdbus-1-3 libatk1.0-0 libasound2 libxss1 libcups2 libxcomposite1 \
    libxrandr2 libxdamage1 libxext6 libxfixes3 libgbm1 libpangocairo-1.0-0 \
    libpango-1.0-0 libatk-bridge2.0-0 libgtk-3-0 chromium \
    && rm -rf /var/lib/apt/lists/*

# Instalar Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
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
