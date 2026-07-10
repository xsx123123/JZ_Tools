"""Simple mock OmicHub monitor server for integration testing."""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer


EVENTS_FILE = "mock_omichub_events.json"


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body)
        except Exception:
            payload = {"raw": body.decode("utf-8", errors="replace")}

        event = {
            "path": self.path,
            "headers": {k: v for k, v in self.headers.items()},
            "body": payload,
        }
        try:
            with open(EVENTS_FILE, "r", encoding="utf-8") as f:
                events = json.load(f)
        except Exception:
            events = []
        events.append(event)
        with open(EVENTS_FILE, "w", encoding="utf-8") as f:
            json.dump(events, f, indent=2, ensure_ascii=False)

        self.send_response(204)
        self.end_headers()

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18080
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Mock OmicHub server listening on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()
