import http.server
import json
import os
import socket
import socketserver
import threading
import webbrowser

PORT = 8765
ROOT = os.path.dirname(os.path.abspath(__file__))


def lan_ip():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path in ("/ip.json", "/ip.json/"):
            payload = json.dumps({"ip": lan_ip(), "port": PORT}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def log_message(self, format, *args):
        return


socketserver.ThreadingTCPServer.allow_reuse_address = True
os.chdir(ROOT)
ip = lan_ip()
httpd = socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler)
httpd.daemon_threads = True

print("", flush=True)
print("  Mein Dienstplan", flush=True)
print("  ---------------", flush=True)
print(f"  Am Computer:  http://localhost:{PORT}", flush=True)
print(f"  Am Handy:     http://{ip}:{PORT}", flush=True)
print("  (Handy und Computer müssen im gleichen WLAN sein)", flush=True)
print("", flush=True)
print("  Fenster offen lassen. Zum Beenden: Strg+C", flush=True)
print("", flush=True)

threading.Timer(0.6, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nBeendet.")
