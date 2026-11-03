import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

// D-1025: o teste de contrato precisa olhar o pixel (texto preto sobre o scrim
// escuro tem hash diferente do certo, mas nenhum par "distinto" pega o erro). Os
// stills do Remotion saem em PNG 8 bits, RGB ou RGBA, sem entrelaçamento.

const BYTES_POR_PIXEL = { 2: 3, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodifica o PNG em { largura, altura, bpp, dados } (dados = pixels sem filtro). */
export function decodificarPng(arquivo) {
  const png = readFileSync(arquivo);
  let largura = 0;
  let altura = 0;
  let bpp = 0;
  const idat = [];
  for (let pos = 8; pos < png.length; ) {
    const tamanho = png.readUInt32BE(pos);
    const tipo = png.toString("latin1", pos + 4, pos + 8);
    const corpo = png.subarray(pos + 8, pos + 8 + tamanho);
    if (tipo === "IHDR") {
      largura = corpo.readUInt32BE(0);
      altura = corpo.readUInt32BE(4);
      bpp = BYTES_POR_PIXEL[corpo[9]];
      if (corpo[8] !== 8 || !bpp || corpo[12] !== 0) {
        throw new Error(`PNG fora do formato esperado (8 bits, RGB/RGBA, sem entrelaçamento): ${arquivo}`);
      }
    } else if (tipo === "IDAT") {
      idat.push(corpo);
    }
    pos += 12 + tamanho;
  }
  const bruto = inflateSync(Buffer.concat(idat));
  const linha = largura * bpp;
  const dados = Buffer.alloc(linha * altura);
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (linha + 1)];
    for (let x = 0; x < linha; x++) {
      const lido = bruto[y * (linha + 1) + 1 + x];
      const esquerda = x >= bpp ? dados[y * linha + x - bpp] : 0;
      const cima = y > 0 ? dados[(y - 1) * linha + x] : 0;
      const cimaEsquerda = y > 0 && x >= bpp ? dados[(y - 1) * linha + x - bpp] : 0;
      const predito = [0, esquerda, cima, (esquerda + cima) >> 1, paeth(esquerda, cima, cimaEsquerda)][filtro];
      dados[y * linha + x] = (lido + predito) & 255;
    }
  }
  return { largura, altura, bpp, dados };
}

/** Quantos pixels opacos têm os três canais abaixo do limite (preto, ou quase). */
export function contarPixelsEscuros(arquivo, limite = 40) {
  const { largura, altura, bpp, dados } = decodificarPng(arquivo);
  let total = 0;
  for (let i = 0; i < largura * altura * bpp; i += bpp) {
    const opaco = bpp === 3 || dados[i + 3] > 200;
    if (opaco && dados[i] < limite && dados[i + 1] < limite && dados[i + 2] < limite) total += 1;
  }
  return total;
}
