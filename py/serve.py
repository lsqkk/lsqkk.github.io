import http.server
import socketserver
import os
import sys
import signal
from urllib.parse import urlparse, unquote

# 默认端口，支持命令行参数覆盖
PORT = 8000
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
        print(f"错误: 端口号必须是整数，使用默认端口 {PORT}")

class HTMLAwareHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # 解码URL编码的路径
        path = unquote(path)
        # 先获取原始路径
        original_path = super().translate_path(path)
        
        # 如果请求的路径不存在，但对应的 .html 文件存在
        if not os.path.exists(original_path):
            html_path = original_path + '.html'
            if os.path.exists(html_path):
                return html_path
                
            # 处理目录索引的情况
            dir_path = original_path
            if os.path.isdir(dir_path) and os.path.exists(os.path.join(dir_path, 'index.html')):
                return os.path.join(dir_path, 'index.html')
                
        return original_path
    
    def do_GET(self):
        # 获取实际路径
        path = self.translate_path(self.path)
        
        # 检查文件是否存在
        if not os.path.exists(path):
            # 尝试查找404页面
            error_path = os.path.join(os.getcwd(), '404.html')
            if os.path.exists(error_path):
                self.send_response(404)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                with open(error_path, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                # 如果没有404页面，返回默认404响应
                self.send_error(404, "File not found")
                return
        
        # 调用父类的GET处理
        super().do_GET()
    
    def log_message(self, format, *args):
        # 简化日志输出，只显示关键信息
        status_code = args[1] if len(args) > 1 else 200
        # 过滤掉favicon.ico请求的日志，减少干扰
        if self.path != '/favicon.ico':
            print(f"[{self.address_string()}] {self.path} -> {status_code}")

def signal_handler(signum, frame):
    """处理中断信号"""
    print("\n服务器正在关闭...")
    sys.exit(0)

def main():
    # 设置信号处理器，支持Ctrl+C中断
    signal.signal(signal.SIGINT, signal_handler)
    
    # 检查当前目录是否存在index.html
    if not os.path.exists('index.html'):
        print("提示: 当前目录下没有找到index.html文件")
    
    # 检查是否存在404.html文件
    if not os.path.exists('404.html'):
        print("提示: 没有找到404.html文件，将使用默认404页面")
    
    try:
        with socketserver.TCPServer(("", PORT), HTMLAwareHTTPRequestHandler) as httpd:
            print(f"服务器运行在 http://localhost:{PORT}")
            print("功能:")
            print("  - 支持 /a -> /a.html 自动映射")
            print("  - 支持目录索引 (index.html)")
            print("  - 自动加载404.html作为404页面")
            print("  - 按 Ctrl+C 停止服务器")
            print("-" * 40)
            
            # 设置超时以便键盘中断可以被捕获
            httpd.timeout = 1
            
            while True:
                try:
                    httpd.handle_request()
                except KeyboardInterrupt:
                    print("\n收到中断信号，正在关闭服务器...")
                    break
                except Exception as e:
                    # 忽略其他异常，继续运行
                    pass
                
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"错误: 端口 {PORT} 已被占用，请尝试其他端口")
            print(f"用法: python {sys.argv[0]} [端口号]")
        else:
            print(f"服务器启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()