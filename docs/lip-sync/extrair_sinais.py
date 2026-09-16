"""Extrai e guarda os sinais (boca, audio) de cada janela, para experimentar rapido."""
import subprocess, sys, os
import numpy as np, cv2

VIDEO, TMP, SAIDA = sys.argv[1], sys.argv[2], sys.argv[3]
JANELAS = [int(t) for t in sys.argv[4].split(",")]
LP, AP, FPS, SR, JAN = 480, 270, 30, 16000, 20
cascata = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
os.makedirs(SAIDA, exist_ok=True)


def ff(t, args, saida):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-t", str(JAN),
                    "-i", VIDEO] + args + [saida], check=True)


for t in JANELAS:
    ff(t, ["-an", "-vf", f"fps={FPS},scale={LP}:{AP},format=gray", "-f", "rawvideo"], f"{TMP}/p.gray")
    fr = np.fromfile(f"{TMP}/p.gray", dtype=np.uint8).reshape(-1, AP, LP)
    cx = [c for i in np.linspace(0, len(fr) - 1, 20, dtype=int)
          for c in cascata.detectMultiScale(fr[i], 1.1, 5, minSize=(30, 30))]
    if len(cx) < 8:
        print(f"{t}s: sem rosto"); continue
    x, y, w, h = np.median(np.array(cx), axis=0).astype(int)
    boca = fr[:, y + int(h * .60): y + h, x: x + w].astype(np.float32)
    vis = np.abs(np.diff(boca, axis=0)).mean(axis=(1, 2))
    ff(t, ["-vn", "-af", "highpass=f=300,lowpass=f=3400", "-ac", "1", "-ar", str(SR),
           "-f", "s16le"], f"{TMP}/a.pcm")
    pcm = np.fromfile(f"{TMP}/a.pcm", dtype=np.int16).astype(np.float32)
    passo = SR // FPS
    n = len(pcm) // passo
    rms = np.array([np.sqrt((pcm[i * passo:(i + 1) * passo] ** 2).mean() + 1e-9) for i in range(n)])
    np.savez(f"{SAIDA}/{t}.npz", visual=vis, rms=rms)
    print(f"{t}s: ok ({len(vis)} quadros)")
for f in ("p.gray", "a.pcm"):
    if os.path.exists(f"{TMP}/{f}"): os.remove(f"{TMP}/{f}")
