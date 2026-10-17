#!/usr/bin/env python3
"""The webdav-shutdown kit's local WebDAV stub (issues #219, #220; #204).

A local HTTP server on 127.0.0.1 at an ephemeral port that stands in for the
WebDAV folder. It logs every request (method, path, epoch ms, body file) as
one JSON object per line to a log file, so the kit's scripts and the tester
can measure exactly when Zotero asked for what.

Modes (switched at runtime by a control request, no restart):
  answer  PROPFIND -> 207 empty multistatus; GET -> 404; PUT/MKCOL -> 201.
  hold    as answer, but each PUT is held N seconds (default 14) first (#204).
  hang    accepts the connection, reads the request, never answers (#219/#220).

Control: GET /__control?mode=answer|hang|hold[&hold=14] -> 200 {"mode": ...}.
Control requests are answered but never logged.

Usage:
  python3 webdav_stub.py --state-dir /tmp/ztts-stub
  # prints one JSON line: {"port": N, "log": ..., "bodies": ..., "pid": ...}

Stop with SIGTERM. Bodies of PUTs are saved under <state-dir>/bodies/.
"""
import json
import os
import signal
import socketserver
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

STATE = {
    "mode": "answer",
    "hold": 14.0,
    "log": None,
    "bodies": None,
    "seq": 0,
    "lock": threading.Lock(),
}

MULTISTATUS = ('<?xml version="1.0" encoding="utf-8"?>'
               '<D:multistatus xmlns:D="DAV:"></D:multistatus>')


def log_request(method, path, body_rel=None, nbytes=0):
    now = time.time()
    entry = {
        "t": int(now * 1000),
        "iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(now)) + f".{int(now * 1000) % 1000:03d}",
        "method": method,
        "path": path,
        "body": body_rel,
        "bytes": nbytes,
    }
    with STATE["lock"]:
        with open(STATE["log"], "a", buffering=1) as f:
            f.write(json.dumps(entry) + "\n")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # silence the stderr access log
        pass

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length > 0 else b""

    def _reply(self, status, body=b"", ctype="text/plain; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _control(self):
        qs = parse_qs(urlparse(self.path).query)
        mode = (qs.get("mode") or [None])[0]
        hold = (qs.get("hold") or [None])[0]
        if mode in ("answer", "hang", "hold"):
            STATE["mode"] = mode
        if hold is not None:
            try:
                STATE["hold"] = float(hold)
            except ValueError:
                pass
        body = json.dumps({"mode": STATE["mode"], "hold": STATE["hold"], "pid": os.getpid()}).encode()
        self._reply(200, body, "application/json")

    def _serve(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/__control":
            self._read_body()
            return self._control()
        body = self._read_body()
        method = self.command
        mode = STATE["mode"]
        if mode == "hang":
            log_request(method, path, None, len(body))
            # Read, log, and never answer: the connection stays open.
            threading.Event().wait()
            return
        body_rel = None
        if method == "PUT" and body:
            with STATE["lock"]:
                STATE["seq"] += 1
                n = STATE["seq"]
            name = "%03d-%s" % (n, os.path.basename(path) or "body.json")
            with open(os.path.join(STATE["bodies"], name), "wb") as f:
                f.write(body)
            body_rel = "bodies/" + name
        log_request(method, path, body_rel, len(body))
        if method == "PUT" and mode == "hold":
            time.sleep(STATE["hold"])
        if method == "PROPFIND":
            self._reply(207, MULTISTATUS.encode(), 'application/xml; charset="utf-8"')
        elif method == "GET":
            self._reply(404, b"not found")
        else:  # PUT, MKCOL, DELETE, ...
            self._reply(201 if method in ("PUT", "MKCOL") else 200, b"")

    do_GET = do_PUT = do_PROPFIND = do_MKCOL = do_DELETE = do_POST = do_OPTIONS = do_HEAD = _serve


class Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    state_dir = sys.argv[sys.argv.index("--state-dir") + 1] if "--state-dir" in sys.argv else "/tmp/ztts-stub"
    os.makedirs(state_dir, exist_ok=True)
    os.makedirs(os.path.join(state_dir, "bodies"), exist_ok=True)
    STATE["log"] = os.path.join(state_dir, "requests.log")
    STATE["bodies"] = os.path.join(state_dir, "bodies")
    open(STATE["log"], "w").close()  # fresh log per start
    server = Server(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    signal.signal(signal.SIGTERM, lambda *a: os._exit(0))
    print(json.dumps({"port": port, "log": STATE["log"], "bodies": STATE["bodies"], "pid": os.getpid()}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
