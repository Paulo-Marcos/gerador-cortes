"""O offset e constante ao longo da live, ou anda? (D-602, pedido do Paulo)"""
import sys
import numpy as np
import cv2

BASE, L, A, FPS, SR = sys.argv[1], 480, 270, 30, 16000
cascata = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")


def z(v):
    return (v - v.mean()) / (v.std() + 1e-9)


def sinais(frames, pcm):
    caixas = []
    for i in np.linspace(0, len(frames) - 1, 30, dtype=int):
        for c in cascata.detectMultiScale(frames[i], 1.1, 5, minSize=(30, 30)):
            caixas.append(c)
    if len(caixas) < 10:
        return None, None, len(caixas)
    x, y, w, h = np.median(np.array(caixas), axis=0).astype(int)
    boca = frames[:, y + int(h * 0.60): y + h, x: x + w].astype(np.float32)
    visual = np.abs(np.diff(boca, axis=0)).mean(axis=(1, 2))
    passo = SR // FPS
    n = len(visual) + 1
    rms = np.array([np.sqrt((pcm[i * passo:(i + 1) * passo] ** 2).mean() + 1e-9) for i in range(n)])
    audio = np.abs(np.diff(rms))
    m = min(len(visual), len(audio))
    return visual[:m], audio[:m], len(caixas)


def medir(vis, aud, max_lag=30):
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
    return lags[i] * 1000 / FPS, r[i], r[i] / (fora.std() + 1e-9)


print(f"{'inicio':>8} {'janela':>14} {'rostos':>7} {'offset':>9} {'r':>7} {'pico/ruido':>11}")
for t in (600, 1800, 3600, 4800):
    frames = np.fromfile(f"{BASE}/f_{t}.gray", dtype=np.uint8).reshape(-1, A, L)
    pcm = np.fromfile(f"{BASE}/a_{t}.pcm", dtype=np.int16).astype(np.float32)
    vis, aud, nr = sinais(frames, pcm)
    if vis is None:
        print(f"{t:>8}s {'60s inteira':>14} {nr:>7} {'sem rosto suficiente':>30}")
        continue
    ms, r, snr = medir(vis, aud)
    print(f"{t:>8}s {'60s inteira':>14} {nr:>7} {ms:>+7.0f}ms {r:>7.3f} {snr:>10.1f}x")
    # sub-janelas de 20s, passo 10s: o offset anda DENTRO do mesmo trecho?
    passo, larg = 10 * FPS, 20 * FPS
    for ini in range(0, len(vis) - larg + 1, passo):
        ms, r, snr = medir(vis[ini:ini + larg], aud[ini:ini + larg])
        rot = f"+{ini // FPS}..{ini // FPS + 20}s"
        print(f"{'':>8}  {rot:>14} {'':>7} {ms:>+7.0f}ms {r:>7.3f} {snr:>10.1f}x")
