"""Verifies renderer/js/qr.js with OpenCV: encode sample payloads in Node, rasterise, decode with cv2.QRCodeDetector.
Run:  python3 desktop/test/qr.test.py   (needs opencv-python + numpy + node)"""
import json, subprocess, sys, os
import numpy as np, cv2
here = os.path.dirname(os.path.abspath(__file__))
samples = ["cm1|https://script.google.com/macros/s/AKfycbxAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOpQrStUv/exec|ABCD-2345",
           "hello", "cm1|https://script.google.com/macros/s/X/exec|ZZZZ-9999", "x" * 150, "عيادة الدكتور زيد"]
js = "const Q=require(%s);const s=%s;console.log(JSON.stringify(s.map(t=>Q.matrix(t))))" % (json.dumps(os.path.join(here, '..', 'renderer', 'js', 'qr.js')), json.dumps(samples))
mats = json.loads(subprocess.check_output(['node', '-e', js]))
bad = 0
for text, m in zip(samples, mats):
    n = len(m); s = 8; q = 4
    img = np.full(((n + 2 * q) * s,) * 2, 255, np.uint8)
    for y, row in enumerate(m):
        for x, d in enumerate(row):
            if d: img[(y + q) * s:(y + q + 1) * s, (x + q) * s:(x + q + 1) * s] = 0
    val, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    ok = val == text
    print(('OK  ' if ok else 'FAIL'), 'v%d' % ((n - 17) // 4), repr(text[:40]), '' if ok else '-> ' + repr(val[:40]))
    bad += not ok
sys.exit(1 if bad else 0)
