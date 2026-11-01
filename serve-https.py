#!/usr/bin/env python3
"""Serve this folder over HTTPS so an iPad (or any device on the network) can use WebGPU.

Browsers only enable WebGPU on secure pages (https:// or localhost), so plain
http://<your-mac-ip>:8123 will not work from another device.

    python3 serve-https.py

The first run creates a self-signed certificate in .certs/. Safari will warn that the
connection isn't private: tap "Show Details", then "visit this website".
"""

import functools
import http.server
import socket
import ssl
import subprocess
from pathlib import Path

PORT = 8443
ROOT = Path(__file__).resolve().parent
CERTS = ROOT / ".certs"
CERT, KEY = CERTS / "cert.pem", CERTS / "key.pem"


def lan_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


def ensure_cert(ip):
    if CERT.exists() and KEY.exists():
        return
    CERTS.mkdir(exist_ok=True)
    subprocess.run(
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
            "-keyout", str(KEY), "-out", str(CERT), "-days", "825",
            "-subj", "/CN=dklearn",
            "-addext", f"subjectAltName=DNS:localhost,IP:127.0.0.1,IP:{ip}",
        ],
        check=True,
        capture_output=True,
    )


def main():
    ip = lan_ip()
    ensure_cert(ip)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    print(f"Open on the iPad:  https://{ip}:{PORT}")
    print(f"Open on this Mac:  https://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
