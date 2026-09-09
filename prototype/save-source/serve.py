#!/usr/bin/env python3
"""PROTOTYPE server. `python3 serve.py` then open http://localhost:8099.

localhost counts as a secure context, so service workers, Share Target and
showDirectoryPicker all work without TLS. For Android, forward this port over USB
(chrome://inspect -> Port forwarding) and the phone gets a secure context too.
"""
import functools, http.server, socketserver, pathlib, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
ROOT = pathlib.Path(__file__).parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
    }

    def end_headers(self):
        # No caching: a prototype you have to hard-refresh is a prototype you stop using.
        self.send_header("Cache-Control", "no-store")
        self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), functools.partial(Handler, directory=str(ROOT))) as httpd:
    print(f"PROTOTYPE Save Source -> http://localhost:{PORT}  (ctrl-c to stop)")
    httpd.serve_forever()
