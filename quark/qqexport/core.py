import os
import re
import sys
import io
from datetime import datetime, date, timedelta

from . import ConfigUtil as Config
from . import RequestUtil as Request
from . import ToolsUtil as Tools
from . import GetAllMomentsUtil as GetAllMoments

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def _find_project_root():
    """从 quark/qqexport/ 向上找到项目根目录（含 assets/md/dt.md）"""
    path = os.path.dirname(os.path.abspath(__file__))
    for _ in range(4):
        path = os.path.dirname(path)
        if os.path.isfile(os.path.join(path, 'assets', 'md', 'dt.md')):
            return path
    return None


PROJECT_ROOT = _find_project_root()
DT_MD_PATH = os.path.join(PROJECT_ROOT, 'assets', 'md', 'dt.md') if PROJECT_ROOT else None


def _parse_export_date(date_str):
    if not date_str or not date_str.strip():
        return None
    try:
        return datetime.strptime(date_str.strip(), "%Y-%m-%d")
    except ValueError:
        return None


def _parse_message_time(date_str):
    if date_str is None:
        return None
    raw = str(date_str).replace('\xa0', ' ').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y年%m月%d日 %H:%M:%S")
    except ValueError:
        pass
    try:
        return datetime.strptime(raw, "%Y年%m月%d日 %H:%M")
    except ValueError:
        return None


def get_latest_date_in_dt():
    """解析 dt.md 中最新的日期，返回 date 对象；文件不存在则返回 None"""
    if not DT_MD_PATH or not os.path.isfile(DT_MD_PATH):
        return None
    with open(DT_MD_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    matches = re.findall(r'## 日期：(\d{4}-\d{2}-\d{2})', content)
    if not matches:
        return None
    try:
        return datetime.strptime(matches[0], "%Y-%m-%d").date()
    except ValueError:
        return None


def generate_markdown(posts):
    """生成新说说的 markdown 字符串（多条 block，reverse chronological）"""
    if not posts:
        return None

    posts_sorted = sorted(
        posts,
        key=lambda x: _parse_message_time(x[0]) or datetime.min,
        reverse=True
    )

    md_blocks = []
    for item in posts_sorted:
        time_str = item[0]
        content_raw = Tools.get_content_from_split(item[1])
        content_raw = content_raw.strip()

        title = "今日更新"
        body = ""
        if content_raw:
            lines = content_raw.splitlines()
            first_line = lines[0].strip() if lines else ""
            if first_line and len(first_line) < 15:
                title = first_line
                body = "\n".join(lines[1:]).strip()
            else:
                body = content_raw.strip()

        date_value = _parse_message_time(time_str)
        date_text = date_value.strftime("%Y-%m-%d") if date_value else time_str

        block_lines = [f"# {title}", "", f"## 日期：{date_text}", ""]
        if body:
            block_lines.append(body)
            block_lines.append("")

        img_urls = str(item[2]).split(",")
        img_index = 1
        for img_url in img_urls:
            img_url = img_url.strip()
            if not img_url or not img_url.startswith("http"):
                continue
            block_lines.append(f"![img_{img_index}]({img_url})")
            block_lines.append("")
            img_index += 1

        md_blocks.append("\n".join(block_lines).rstrip())

    return "\n\n".join(md_blocks).rstrip() + "\n"


def run(verbose=True):
    if not PROJECT_ROOT:
        print("错误：找不到项目根目录（找不到 assets/md/dt.md）")
        sys.exit(1)

    # 1. 自动确定日期范围
    latest = get_latest_date_in_dt()
    today_date = date.today()

    if latest:
        start_dt = datetime.combine(latest + timedelta(days=1), datetime.min.time())
        if start_dt.date() > today_date:
            print("dt.md 已有最新数据，无需更新")
            return
    else:
        start_dt = None
    end_dt = datetime.combine(today_date, datetime.min.time())

    if verbose:
        start_str = start_dt.strftime("%Y-%m-%d") if start_dt else "不限"
        print(f"自动检测时间范围: {start_str} ~ {today_date}")

    # 2. 登录
    try:
        user_info = Request.get_login_user_info()
        print(f"用户<{Request.get_uin()}>登录成功")
    except Exception as e:
        print(f"登录失败: 请重新登录, 错误信息: {str(e)}")
        sys.exit(1)

    # 3. 获取说说
    texts = []
    try:
        user_moments = GetAllMoments.get_visible_moments_list(start_dt=start_dt, end_dt=end_dt)
        if user_moments:
            texts = user_moments
    except Exception as err:
        print(f"获取QQ空间记录发生异常: {str(err)}")

    # 4. 生成新内容并合并到 dt.md
    new_md = generate_markdown(texts)
    if not new_md:
        print('没有找到新的说说')
        return

    if verbose:
        print(f'\n导出成功，共 {len(texts)} 条说说')

    with open(DT_MD_PATH, 'r', encoding='utf-8') as f:
        existing = f.read()

    # 新内容在最前（新到旧），dt.md 也是新到旧排列
    combined = new_md + "\n" + existing
    with open(DT_MD_PATH, 'w', encoding='utf-8') as f:
        f.write(combined)

    if verbose:
        print(f'已合并更新至 {DT_MD_PATH}')
