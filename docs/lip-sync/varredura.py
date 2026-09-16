"""Varredura: muitas janelas curtas, so as confiaveis contam (D-602)."""
import subprocess, sys, os
import numpy as np, cv2

VIDEO, TMP = sys.argv[1], sys.argv[2]
L, A, FPS, SR, JAN = 480, 270, 30, 16000, 20
cascata = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
z = lambda v: (v - v.mean()) / (v.std() + 1e-9)


def extrair(t):
    fg, ap = f"{TMP}/f.gray", f"{TMP}/a.pcm"
    base = ["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-t", str(JAN), "-i", VIDEO]
    subprocess.run(base + ["-an", "-vf", f"fps={FPS},scale={L}:{A},format=gray",
                           "-f", "rawvideo", fg], check=True)
    subprocess.run(base + ["-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", ap], check=True)
    return (np.fromfile(fg, dtype=np.uint8).reshape(-1, A, L),
            np.fromfile(ap, dtype=np.int16).astype(np.float32))


def medir(t):
    frames, pcm = extrair(t)
    caixas = [c for i in np.linspace(0, len(frames) - 1, 20, dtype=int)
              for c in cascata.detectMultiScale(frames[i], 1.1, 5, minSize=(30, 30))]
    if len(caixas) < 8:
        return None, 0.0, len(caixas)
    x, y, w, h = np.median(np.array(caixas), axis=0).astype(int)
    boca = frames[:, y + int(h * .60): y + h, x: x + w].astype(np.float32)
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
    return lags[i] * 1000 / FPS, r[i], len(caixas)


LIMIAR = 0.30
print(f"{'t':>7} {'rostos':>7} {'offset':>9} {'r':>7}  veredito")
bons = []
for t in range(300, 5400, 300):
    ms, r, nr = medir(t)
    if ms is None:
        print(f"{t:>6}s {nr:>7} {'—':>9} {'—':>7}  sem rosto")
        continue
    ok = r >= LIMIAR
    if ok:
        bons.append(ms)
    print(f"{t:>6}s {nr:>7} {ms:>+7.0f}ms {r:>7.3f}  {'CONFIAVEL' if ok else 'descartada (r baixo)'}")

print(f"\njanelas confiaveis (r>={LIMIAR}): {len(bons)} de 17")
if bons:
    b = np.array(bons)
    print(f"  offsets: {[f'{v:+.0f}' for v in b]}")
    print(f"  mediana {np.median(b):+.0f}ms   desvio {b.std():.0f}ms   faixa {b.min():+.0f}..{b.max():+.0f}ms")
for f in ("f.gray", "a.pcm"):
    os.remove(f"{TMP}/{f}")
