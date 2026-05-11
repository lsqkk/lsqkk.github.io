import click
import json
import os
import re
import shutil
import hashlib
import mimetypes
import random
import string
import urllib.parse
from pathlib import Path
from datetime import datetime

import boto3
from botocore.config import Config as BotoConfig

from ..utils import get_blog_root

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'}
NAMED_MODES = ('md5', 'ts', 'original')


def _load_r2_config():
    blog_root = Path(get_blog_root())
    config_path = blog_root / 'private' / 'config' / 'r2.json'
    if not config_path.exists():
        raise FileNotFoundError(
            f"R2 配置文件不存在: {config_path}\n"
            "请创建 private/config/r2.json 并填入 R2 凭据"
        )
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _get_s3_client(config):
    return boto3.client(
        's3',
        endpoint_url=config['endpoint'],
        aws_access_key_id=config['access_key_id'],
        aws_secret_access_key=config['secret_access_key'],
        config=BotoConfig(signature_version='s3v4'),
    )


def _is_image(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in IMAGE_EXTENSIONS


def _collect_images(path: Path) -> list[Path]:
    if path.is_file():
        return [path] if _is_image(path.name) else []
    return sorted(
        p for p in path.iterdir()
        if p.is_file() and _is_image(p.name)
    )


def _compute_object_key(filepath: Path, naming: str) -> str:
    base = filepath.stem
    ext = filepath.suffix.lower()
    year = datetime.now().strftime('%Y')
    month = datetime.now().strftime('%m')

    if naming == 'md5':
        h = hashlib.md5()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                h.update(chunk)
        name = h.hexdigest()
    elif naming == 'ts':
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
        name = f"{ts}_{rand}"
    else:  # original
        safe = re.sub(r'\s+', '_', base.strip())
        safe = re.sub(r'[^\w.\-]', '', safe)
        name = safe or 'unnamed'

    return f"pic/{year}/{month}/{name}{ext}"


def _upload_file(s3, config, filepath: Path, naming: str) -> tuple[str, str, str]:
    key = _compute_object_key(filepath, naming)

    content_type, _ = mimetypes.guess_type(str(filepath))
    extra_args = {'ContentType': content_type or 'application/octet-stream'}

    s3.upload_file(str(filepath), config['bucket'], key, ExtraArgs=extra_args)

    encoded_key = urllib.parse.quote(key, safe='/')
    public_url = f"{config['public_base_url']}/{encoded_key}"
    filename_for_md = Path(key).name
    markdown = f"![{filename_for_md}]({public_url})"
    return public_url, markdown, key


@click.command()
@click.argument('source', required=False, default=None)
@click.option('--dir', '-d', 'dir_path',
              help='指定包含图片的目录（与直接传目录参数等效）')
@click.option('--naming', '-n',
              type=click.Choice(NAMED_MODES, case_sensitive=False),
              default='md5', show_default=True,
              help='命名模式: md5(哈希去重) / ts(时间戳) / original(保留原名)')
def cli(source, dir_path, naming):
    """上传图片到 Cloudflare R2 图床

    默认上传 /private/pic/ 下的所有图片，上传完成后移动到 /private/pic_done/。

    也可指定 SOURCE 为某张图片的路径或某个目录。

    命名模式:

    md5 (默认)  根据文件内容 MD5 命名，内容相同则覆盖，天然去重。

    ts          按上传时间戳 + 随机后缀命名，类似网页上传行为。

    original    保留原始文件名（特殊字符会被清理）。
    """
    blog_root = Path(get_blog_root())
    default_src = blog_root / 'private' / 'pic'
    pic_done = blog_root / 'private' / 'pic_done'

    # --- 收集待上传文件 ---
    files_to_upload = []

    if source:
        src = Path(source)
        if not src.is_absolute():
            src = blog_root / source
        if not src.exists():
            click.echo(f"错误: 路径不存在: {src}", err=True)
            return
        files_to_upload = _collect_images(src)
        if not files_to_upload:
            hint = "目录" if src.is_dir() else "文件"
            click.echo(f"错误: {hint}中没有找到支持的图片: {src}", err=True)
            return
    elif dir_path:
        src = Path(dir_path)
        if not src.is_absolute():
            src = blog_root / dir_path
        if not src.exists() or not src.is_dir():
            click.echo(f"错误: 目录不存在: {src}", err=True)
            return
        files_to_upload = _collect_images(src)
        if not files_to_upload:
            click.echo(f"目录中没有找到支持的图片: {src}", err=True)
            return
    else:
        if not default_src.exists():
            click.echo(f"错误: 默认图片目录不存在: {default_src}", err=True)
            return
        files_to_upload = _collect_images(default_src)
        if not files_to_upload:
            click.echo("默认目录中没有需要上传的图片。", err=True)
            return

    # --- 加载配置 ---
    try:
        config = _load_r2_config()
    except FileNotFoundError as e:
        click.echo(str(e), err=True)
        return

    # --- 创建 S3 客户端 ---
    try:
        s3 = _get_s3_client(config)
    except Exception as e:
        click.echo(f"创建 S3 客户端失败: {e}", err=True)
        return

    pic_done.mkdir(parents=True, exist_ok=True)

    naming_label = {'md5': 'MD5 哈希', 'ts': '时间戳', 'original': '保留原名'}
    click.echo(f"共发现 {len(files_to_upload)} 张图片，命名模式: {naming_label.get(naming, naming)}")
    click.echo("开始上传至 R2 ...\n")

    success = 0
    failed = 0

    for fp in files_to_upload:
        try:
            click.echo(f"  ↑ 上传中: {fp.name}")
            public_url, markdown, remote_key = _upload_file(s3, config, fp, naming)

            click.echo(f"     URL: {public_url}")
            click.echo(f"     MD : {markdown}")

            # 移动到 pic_done
            dest = pic_done / fp.name
            if dest.exists():
                stem = dest.stem
                suffix = dest.suffix
                ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                dest = pic_done / f"{stem}_{ts}{suffix}"
            shutil.move(str(fp), str(dest))
            click.echo(f"     → 已移至: {dest.name}")

            success += 1
        except Exception as e:
            click.echo(f"  ✗ 上传失败: {fp.name} — {e}", err=True)
            failed += 1

    click.echo(f"\n√ 完成: 成功 {success} 张，失败 {failed} 张")
    if success:
        click.echo("可在上方复制 Markdown 格式链接直接粘贴到文章中使用。")
