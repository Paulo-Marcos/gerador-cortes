// D-1127 (E-069 H-11c) · Miniatura de 64 px da capa, feita no front até o backend servir a
// dele (B-3). A aurora desfoca uma imagem pequena UMA vez: reduzir aqui, por live, é o que a
// deixa barata (DIRECAO §3.6). Falhou (CORS, rede, sem canvas): `null`, e a aurora fica só
// com os halos, nunca com a capa grande desfocada a cada quadro.

export const LARGURA_DA_MINIATURA = 64;

const guardadas = new Map<string, Promise<string | null>>();

/** Mantém uma miniatura por capa; `blob:` vive enquanto a aba viver (são ~2 KB cada). */
export function miniaturaDaCapa(urlDaCapa: string): Promise<string | null> {
  const ja = guardadas.get(urlDaCapa);
  if (ja) return ja;
  const feita = reduzir(urlDaCapa).then((blob) => {
    // Falha não fica guardada: uma rede que volta deve poder tentar de novo.
    if (!blob) guardadas.delete(urlDaCapa);
    return blob;
  });
  guardadas.set(urlDaCapa, feita);
  return feita;
}

export function esquecerMiniaturas(): void {
  guardadas.clear();
}

function reduzir(url: string): Promise<string | null> {
  return new Promise((resolver) => {
    if (typeof document === 'undefined') return resolver(null);
    const img = new Image();
    // Sem isto o canvas fica "sujo" e `toBlob` recusa: é a exigência de CORS da §11.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const largura = LARGURA_DA_MINIATURA;
        const altura = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * largura));
        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolver(null);
        ctx.drawImage(img, 0, 0, largura, altura);
        canvas.toBlob((blob) => resolver(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.7);
      } catch {
        resolver(null);
      }
    };
    img.onerror = () => resolver(null);
    img.src = url;
  });
}
