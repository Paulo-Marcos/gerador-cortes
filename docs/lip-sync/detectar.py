"""Experimento D-602: da para medir o lip-sync correlacionando boca x audio?

Teste honesto: injeta um atraso CONHECIDO no audio e ve se o metodo o reencontra.
"""
import sys
import numpy as np
import cv2

BASE = sys.argv[1]
L, A = 320, 180
FPS = 30
SR = 16000

frames = np.fromfile(f"{BASE}/frames.gray", dtype=np.uint8).reshape(-1, A, L)
pcm = np.fromfile(f"{BASE}/audio.pcm", dtype=np.int16).astype(np.float32)
print(f"frames={frames.shape[0]} ({frames.shape[0]/FPS:.1f}s)  audio={len(pcm)/SR:.1f}s")

# ── 1. Onde esta o rosto? Haar sobre alguns quadros espalhados.
cascata = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
caixas = []
for i in np.linspace(0, len(frames) - 1, 24, dtype=int):
    for (x, y, w, h) in cascata.detectMultiScale(frames[i], 1.1, 5, minSize=(24, 24)):
        caixas.append((x, y, w, h))
print(f"rostos detectados em {len(caixas)} de 24 amostras")
if not caixas:
    sys.exit("sem rosto na janela — experimento inconclusivo aqui")

x, y, w, h = np.median(np.array(caixas), axis=0).astype(int)
print(f"caixa mediana: x={x} y={y} w={w} h={h}")

# ── 2. Sinal visual: quanto a regiao da BOCA (terco inferior do rosto) muda.
boca = frames[:, y + int(h * 0.60): y + h, x: x + w].astype(np.float32)
visual = np.abs(np.diff(boca, axis=0)).mean(axis=(1, 2))

# ── 3. Sinal sonoro: energia RMS por quadro, e o quanto ela muda.
n = len(visual) + 1
passo = SR // FPS
rms = np.array([np.sqrt((pcm[i * passo:(i + 1) * passo] ** 2).mean() + 1e-9) for i in range(n)])
audio = np.abs(np.diff(rms))

m = min(len(visual), len(audio))
visual, audio = visual[:m], audio[:m]

def z(v):
    return (v - v.mean()) / (v.std() + 1e-9)

def correlacionar(vis, aud, max_lag=30):
    """Pico da correlacao e quao destacado ele e do resto (razao pico/ruido)."""
    vis, aud = z(vis), z(aud)
    lags = np.arange(-max_lag, max_lag + 1)
    r = []
    for k in lags:
        a = aud[k:] if k >= 0 else aud[:k]
        v = vis[:len(a)] if k >= 0 else vis[-len(a):]
        r.append(float(np.dot(z(v), z(a)) / len(a)))
    r = np.array(r)
    i = int(np.argmax(r))
    fora = np.abs(r[np.abs(lags - lags[i]) > 5])
    return lags[i], r[i], r[i] / (fora.std() + 1e-9)

print("\n── controle: atraso injetado vs. atraso recuperado ──")
for injetado in (0, -9, -3, 3, 9):          # quadros (a 30fps: 300ms, 100ms)
    a = np.roll(audio, injetado)
    lag, pico, snr = correlacionar(visual, a)
    ms_inj, ms_rec = injetado * 1000 / FPS, lag * 1000 / FPS
    erro = abs(ms_rec - ms_inj)
    marca = "ok " if erro <= 34 else "ERRO"
    print(f"  {marca} injetado {ms_inj:+7.0f}ms → recuperado {ms_rec:+7.0f}ms "
          f"(r={pico:.3f}, pico/ruido={snr:.1f}x)")
