#!/usr/bin/env python3
from __future__ import annotations

import http.server
import os
import socketserver
import sys
from pathlib import Path


class HTMLAwareHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        translated = super().translate_path(path)

        if not os.path.exists(translated):
            html_path = translated + ".html"
            if os.path.exists(html_path):
                return html_path

            if os.path.isdir(translated):
                index_path = os.path.join(translated, "index.html")
                if os.path.exists(index_path):
                    return index_path

        return translated


def main() -> int:
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"无效端口: {sys.argv[1]}")
            return 1

    root = Path(__file__).resolve().parents[2]
    dist_dir = root / "dist"
    if not dist_dir.exists():
        print("未找到 dist 目录，请先执行 `quark build`。")
        return 1

    os.chdir(dist_dir)

    with socketserver.TCPServer(("", port), HTMLAwareHTTPRequestHandler) as httpd:
        print(f"服务器运行在 http://localhost:{port}")
        print(f"当前服务目录: {dist_dir}")
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
