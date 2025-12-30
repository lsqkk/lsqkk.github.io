# 启动本地服务器

import http.server
import socketserver
import os
from urllib.parse import urlparse

# 端口
PORT = 8080

class HTMLAwareHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # 先获取原始路径
        path = super().translate_path(path)
        
        # 如果请求的路径不存在，但对应的 .html 文件存在
        if not os.path.exists(path):
            html_path = path + '.html'
            if os.path.exists(html_path):
                return html_path
                
            # 处理目录索引的情况
            dir_path = path
            if os.path.isdir(dir_path) and os.path.exists(os.path.join(dir_path, 'index.html')):
                return os.path.join(dir_path, 'index.html')
                
        return path


with socketserver.TCPServer(("", PORT), HTMLAwareHTTPRequestHandler) as httpd:
    print(f"服务器运行在 http://localhost:{PORT}")
    print("支持 /a -> /a.html 自动映射")
    httpd.serve_forever()