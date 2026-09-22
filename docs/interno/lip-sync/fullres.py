"""E se a boca vier na resolucao ORIGINAL? (D-602, 2a iteracao)"""
import subprocess, sys, os
import numpy as np, cv2

VIDEO, TMP = sys.argv[1], sys.argv[2]
LP, AP, FPS, SR, JAN = 480, 270, 30, 16000, 20
ESC = 1280 / LP  # fator para voltar do preview ao full-res
cascata = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
z = lambda v: (v - v.mean()) / (v.std() + 1e-9)


def ff(t, args, saida):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-t", str(JAN),
                    "-i", VIDEO] + args + [saida], check=True)


def caixa_do_rosto(t):
    ff(t, ["-an", "-vf", f"fps={FPS},scale={LP}:{AP},format=gray", "-f", "rawvideo"], f"{TMP}/p.gray")
    fr = np.fromfile(f"{TMP}/p.gray", dtype=np.uint8).reshape(-1, AP, LP)
    cx = [c for i in np.linspace(0, len(fr) - 1, 20, dtype=int)
          for c in cascata.detectMultiScale(fr[i], 1.1, 5, minSize=(30, 30))]
    if len(cx) < 8:
        return None
    return np.median(np.array(cx), axis=0).astype(int)


def medir(t):
    cx = caixa_do_rosto(t)
    if cx is None:
        return None, 0.0, 0
    x, y, w, h = (np.array(cx) * ESC).astype(int)
    # so a boca, no pixel original; par para o ffmpeg nao reclamar
    bx, by = x, y + int(h * 0.55)
    bw, bh = (w // 2) * 2, (int(h * 0.45) // 2) * 2
    ff(t, ["-an", "-vf", f"fps={FPS},crop={bw}:{bh}:{bx}:{by},format=gray", "-f", "rawvideo"],
       f"{TMP}/b.gray")
    ff(t, ["-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le"], f"{TMP}/a.pcm")
    boca = np.fromfile(f"{TMP}/b.gray", dtype=np.uint8).reshape(-1, bh, bw).astype(np.float32)
    pcm = np.fromfile(f"{TMP}/a.pcm", dtype=np.int16).astype(np.float32)
    vis = np.abs(np.diff(boca, axis=0)).mean(axis=(1, 2))
    passo = SR // FPS
    rms = np.array([np.sqrt((pcm[i * passo:(i + 1) * passo] ** 2).mean() + 1e-9)
                    for i in range(len(vis) + 1)])
    aud = np.abs(np.diff(rms))
    m = min(len(vis), len(aud))
    vis, aud = z(vis[:m]), z(aud[:m])
    lags = np.arange(-30, 31)
    r = []
    for k in lags:
        a = aud[k:] if k >= 0 else aud[:k]
        v = vis[:len(a)] if k >= 0 else vis[-len(a):]
        r.append(float(np.dot(z(v), z(a)) / len(a)))
    r = np.array(r)
    i = int(np.argmax(r))
    return lags[i] * 1000 / FPS, r[i], bw


print(f"{'t':>7} {'boca px':>8} {'offset':>9} {'r':>7}")
bons = []
for t in (300, 600, 900, 1200, 1500, 1800, 2100, 2700, 3000, 3600, 3900, 5100):
    ms, r, bw = medir(t)
    if ms is None:
        print(f"{t:>6}s {'—':>8} {'sem rosto':>9}")
        continue
    if r >= 0.30:
        bons.append(ms)
    print(f"{t:>6}s {bw:>8} {ms:>+7.0f}ms {r:>7.3f}  {'CONFIAVEL' if r >= .3 else ''}")
b = np.array(bons)
print(f"\nconfiaveis: {len(bons)}/12", end="")
if len(bons):
    print(f"   offsets {[f'{v:+.0f}' for v in b]}  mediana {np.median(b):+.0f}ms  desvio {b.std():.0f}ms")
for f in ("p.gray", "b.gray", "a.pcm"):
    if os.path.exists(f"{TMP}/{f}"):
        os.remove(f"{TMP}/{f}")
