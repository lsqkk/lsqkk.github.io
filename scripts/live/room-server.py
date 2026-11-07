"""Public room state and bounded, in-memory chat for a single MediaMTX path."""

from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import secrets
from threading import Lock
from time import monotonic
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen


MEDIA_PATH = "http://127.0.0.1:9997/v3/paths/get/quark"
ORIGINS = {
    "https://lsqkk.github.io",
    "https://130923.xyz",
    "https://www.130923.xyz",
    "https://live.130923.xyz",
}
CHAT_ENABLED = os.getenv("QUARK_CHAT", "1") == "1"

lock = Lock()
history = deque(maxlen=60)
last_message = {}
recent_posts = deque()
revision = secrets.token_hex(8)
last_stream = None
started_at = None
checked_at = float("-inf")
media_available = False


def refresh_status():
    global checked_at, started_at, last_stream, revision, media_available
    now = monotonic()
    if now - checked_at >= 1.5:
        checked_at = now
        try:
            with urlopen(MEDIA_PATH, timeout=1.25) as response:
                path = json.load(response)
            started_at = path["readyTime"] if path["ready"] else None
            media_available = True
        except HTTPError as error:
            media_available = error.code == 404
            started_at = None
        except (OSError, ValueError, KeyError):
            media_available = False
        if media_available and started_at and started_at != last_stream:
            last_stream = started_at
            history.clear()
            revision = secrets.token_hex(8)
    return media_available


class RoomHandler(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(5)
        super().setup()

    def log_message(self, *_):
        pass

    def reply(self, status, data=None, allowed_origin=None):
        body = json.dumps(data).encode() if data is not None else b""
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
        if status == 204:
            self.send_header("Access-Control-Allow-Methods", "POST")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path != "/api/room":
            self.reply(404, {"error": "找不到该接口。"})
            return
        since = parse_qs(url.query).get("since", [""])[0]
        with lock:
            if refresh_status():
                status = 200
                state = {
                    "live": bool(started_at),
                    "startedAt": started_at,
                    "chatOpen": CHAT_ENABLED and bool(started_at),
                    "revision": revision,
                }
                if since != revision:
                    state["messages"] = list(history)
            else:
                status, state = 503, {"error": "直播服务暂不可用。"}
        self.reply(status, state, "*")

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if self.path == "/api/chat" and origin in ORIGINS:
            self.reply(204, allowed_origin=origin)
        else:
            self.reply(403, {"error": "该来源不能发送消息。"})

    def do_POST(self):
        origin = self.headers.get("Origin")
        if self.path != "/api/chat" or origin not in ORIGINS:
            self.reply(403, {"error": "该来源不能发送消息。"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if self.headers.get_content_type() != "application/json" or not 0 < length <= 4096:
                raise ValueError()
            payload = json.loads(self.rfile.read(length))
            nickname = " ".join(payload.get("nickname", "").split()) or "访客"
            message = " ".join(payload["message"].split())
            if len(nickname) > 20 or not 0 < len(message) <= 200:
                raise ValueError()
            (nickname + message).encode("utf-8")
        except (OSError, ValueError, AttributeError, KeyError, TypeError):
            self.reply(400, {"error": "请输入 1 至 200 字的消息，昵称最多 20 字。"}, origin)
            return

        with lock:
            status, state = self.post_message(payload.get("streamId"), nickname, message)
        self.reply(status, state, origin)

    def post_message(self, stream_id, nickname, message):
        global revision
        if not refresh_status() or not CHAT_ENABLED or not started_at or stream_id != started_at:
            return 409, {"error": "当前场次的聊天室未开放。"}

        now = monotonic()
        client = self.headers.get("X-Quark-Client", "")
        while recent_posts and now - recent_posts[0] >= 10:
            recent_posts.popleft()
        for key, last in list(last_message.items()):
            if now - last >= 5:
                del last_message[key]
        if client in last_message or len(recent_posts) >= 20:
            return 429, {"error": "发送太快，请等几秒。"}

        last_message[client] = now
        recent_posts.append(now)
        revision = secrets.token_hex(8)
        history.append({
            "id": revision,
            "nickname": nickname,
            "message": message,
            "time": datetime.now(timezone.utc).isoformat(),
        })
        return 201, {"ok": True}


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8790), RoomHandler).serve_forever()
