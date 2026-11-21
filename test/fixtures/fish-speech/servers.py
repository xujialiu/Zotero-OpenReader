"""Run the two loopback Fish Speech fixtures for case 1a.15 (requires ffmpeg)."""

import hashlib
import json
import subprocess
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread


class FishSpeech(BaseHTTPRequestHandler):
    def reply(self, data, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def json(self, value):
        self.reply(json.dumps(value).encode(), "application/json")

    def do_GET(self):
        if self.path == "/v1/health":
            self.json({"status": "ok"})
        elif self.path == "/v1/references/list":
            self.json({"reference_ids": ["bella", "cedar"]})
        elif self.path == "/counts":
            self.json(self.server.calls)
        elif self.path == "/audio":
            self.reply(self.server.audio, "audio/mpeg")
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != "/v1/tts":
            return self.send_error(404)
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.calls.append({"voice": request["reference_id"], "text": request["text"]})
        self.reply(self.server.audio, "audio/mpeg")

    def log_message(self, *args):
        pass


def main():
    with ExitStack() as servers:
        for name, port, frequency in [("A", 63670, 440), ("B", 63671, 660)]:
            server = servers.enter_context(ThreadingHTTPServer(("127.0.0.1", port), FishSpeech))
            server.calls = []
            server.audio = subprocess.check_output([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                f"sine=frequency={frequency}:duration=0.65", "-codec:a", "libmp3lame",
                "-f", "mp3", "-",
            ])
            Thread(target=server.serve_forever, daemon=True).start()
            servers.callback(server.shutdown)
            print(f"{name} http://127.0.0.1:{port} SHA-256 {hashlib.sha256(server.audio).hexdigest()}", flush=True)
        try:
            Event().wait()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
