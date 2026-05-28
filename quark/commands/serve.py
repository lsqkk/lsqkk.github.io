import click
import os
import subprocess
import sys
import re

BUILD_FILTER = re.compile(r'(error|warn|\bcompleted\b|✓|built in)', re.IGNORECASE)


def filtered_build(root):
    """执行 npm run build，过滤冗余日志，只保留关键行"""
    click.echo("▶ 构建中...")
    proc = subprocess.Popen(
        ["npm", "run", "build"],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )

    last_line = ""
    for line in proc.stdout:
        if BUILD_FILTER.search(line):
            click.echo(line, nl=False)
            last_line = line

    proc.wait()
    if proc.returncode != 0:
        click.echo("\n❌ 构建失败", err=True)
        click.echo("提示：运行 npm run build 查看完整日志", err=True)
        raise SystemExit(1)

    # 提取页面总数供预览提示
    match = re.search(r'(\d+) page\(s\) built', last_line)
    if match:
        click.echo(f"▶ {match.group(1)} 个页面构建完成")


@click.command()
@click.option('--port', default=4321, help='预览服务器端口（默认 4321）')
@click.option('--host', is_flag=True, help='监听局域网（0.0.0.0）')
@click.option('--dev', is_flag=True, help='启动开发服务器（HMR 热更新，替代 build+preview）')
def cli(port, host, dev):
    """构建并启动预览服务器（build + preview）

    默认执行 npm run build（过滤冗余日志）后启动静态预览。

    使用 --dev 可切换到 HMR 热更新开发服务器（等同于旧版行为）。
    """
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    if dev:
        args = ["dev", "--port", str(port)]
        if host:
            args.append("--host")
        try:
            click.echo(f"启动 Astro 开发服务器 (http://localhost:{port})")
            click.echo("按 Ctrl+C 停止")
            subprocess.run(["npx", "astro", *args], cwd=root, check=True, shell=True)
        except KeyboardInterrupt:
            click.echo("\n服务器已停止")
        except Exception as e:
            click.echo(f"启动服务器失败: {e}", err=True)
            click.echo("提示：请确保已执行 npm install", err=True)
        return

    # 默认路径：build + preview
    filtered_build(root)

    preview_args = ["preview", "--port", str(port)]
    if host:
        preview_args.append("--host")
    try:
        click.echo(f"\n▶ 启动预览服务器 (http://localhost:{port})")
        click.echo("按 Ctrl+C 停止")
        subprocess.run(["npx", "astro", *preview_args], cwd=root, check=True, shell=True)
    except KeyboardInterrupt:
        click.echo("\n服务器已停止")
    except Exception as e:
        click.echo(f"启动预览服务器失败: {e}", err=True)
