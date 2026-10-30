#!/usr/bin/env python3
"""Captures d'écrans de l'app SanteCI via CDP (websocket minimal, stdlib only)."""
import base64, hashlib, json, os, socket, struct, subprocess, sys, time, urllib.request

CHROME = "/opt/meta-chromium/chrome"
SHOT_DIR = os.path.dirname(os.path.abspath(__file__))
PROFILE = "/tmp/santeci-chrome-profile"

def ws_connect(host, port, path):
    key = base64.b64encode(os.urandom(16)).decode()
    s = socket.create_connection((host, port), timeout=15)
    req = (f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
           f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
    s.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        chunk = s.recv(4096)
        if not chunk:
            raise RuntimeError("handshake failed")
        resp += chunk
    accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
    if accept.encode() not in resp:
        raise RuntimeError("bad accept key")
    return s

def ws_send(s, obj):
    data = json.dumps(obj).encode()
    hdr = bytes([0x81])
    n = len(data)
    if n < 126:
        hdr += struct.pack("!B", 0x80 | n)
    elif n < 65536:
        hdr += struct.pack("!BBH", 0x80 | 126, n)
    else:
        hdr += struct.pack("!BBQ", 0x80 | 127, n)
    s.sendall(hdr + data)

def ws_recv(s):
    hdr = s.recv(2)
    if len(hdr) < 2:
        return None
    opcode = hdr[0] & 0x0F
    masked = hdr[1] & 0x80
    ln = hdr[1] & 0x7F
    if ln == 126:
        ln = struct.unpack("!H", s.recv(2))[0]
    elif ln == 127:
        ln = struct.unpack("!Q", s.recv(8))[0]
    if masked:
        mask = s.recv(4)
    payload = b""
    while len(payload) < ln:
        payload += s.recv(ln - len(payload))
    if masked:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    if opcode == 0x8:
        return None
    return json.loads(payload.decode())

class CDP:
    def __init__(self, ws_url):
        from urllib.parse import urlparse
        u = urlparse(ws_url)
        self.s = ws_connect(u.hostname, u.port, u.path)
        self.seq = 0
    def call(self, method, params=None, timeout=20):
        self.seq += 1
        ws_send(self.s, {"id": self.seq, "method": method, "params": params or {}})
        end = time.time() + timeout
        while time.time() < end:
            msg = ws_recv(self.s)
            if msg is None:
                raise RuntimeError("ws closed")
            if msg.get("id") == self.seq:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method}: {msg['error']}")
                return msg.get("result", {})
        raise TimeoutError(method)
    def evaluate(self, expr, await_promise=False):
        return self.call("Runtime.evaluate", {"expression": expr, "awaitPromise": await_promise,
                                              "returnByValue": True})["result"]["value"]

def main():
    os.makedirs(SHOT_DIR, exist_ok=True)
    os.makedirs(PROFILE, exist_ok=True)
    chrome = subprocess.Popen([CHROME, "--headless=new", f"--user-data-dir={PROFILE}",
                               "--no-sandbox", "--disable-gpu", "--window-size=1366,900",
                               "--remote-debugging-port=9333", "--hide-scrollbars",
                               "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        devtools = None
        for _ in range(30):
            try:
                devtools = json.load(urllib.request.urlopen("http://127.0.0.1:9333/json/version", timeout=2))
                break
            except Exception:
                time.sleep(1)
        if not devtools:
            raise RuntimeError("devtools indisponible")
        cdp = CDP(devtools["webSocketDebuggerUrl"])
        cdp.call("Target.createTarget", {"url": "about:blank"})
        time.sleep(0.5)
        targets = json.load(urllib.request.urlopen("http://127.0.0.1:9333/json/list", timeout=5))
        page = [t for t in targets if t["type"] == "page" and "about:blank" in t["url"]][-1]
        tab = CDP(page["webSocketDebuggerUrl"])
        tab.call("Page.enable")
        tab.call("Runtime.enable")

        def shot(name, url=None):
            if url:
                tab.call("Page.navigate", {"url": url})
                tab.evaluate("""new Promise(r => {
                  const done = () => (document.readyState === 'complete') ? r(1) : setTimeout(done, 200);
                  done(); })""", await_promise=True)
                time.sleep(1.5)
            res = tab.call("Page.captureScreenshot", {"format": "png"})
            p = os.path.join(SHOT_DIR, name)
            open(p, "wb").write(base64.b64decode(res["data"]))
            print("shot:", p)

        # 1. écran de connexion
        shot("01-connexion.png", "http://localhost:3101/login")
        # 2. login réel
        tab.evaluate("""(() => {
          const em = document.querySelector('input[type=email]');
          const pw = document.querySelector('input[type=password]');
          const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.__proto__, 'value'); };
          em.focus(); document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, 'admin@clinique.ci');
          pw.focus(); document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, 'Demo1234!');
        })()""")
        time.sleep(0.5)
        shot("02-connexion-remplie.png")
        tab.evaluate("""document.querySelector('form').requestSubmit()""")
        time.sleep(2.5)
        # 3. tableau de bord
        shot("03-dashboard.png", "http://localhost:3101/dashboard")
        # 4. patients
        shot("04-patients.png", "http://localhost:3101/patients")
        # 5. rendez-vous
        shot("05-rendezvous.png", "http://localhost:3101/appointments")
        # 6. factures
        shot("06-factures.png", "http://localhost:3101/invoices")
        print("OK")
    finally:
        chrome.terminate()

if __name__ == "__main__":
    main()
