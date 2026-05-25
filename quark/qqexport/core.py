import io
import json
import os
import re
import sys
from datetime import datetime, date, timedelta

from . import ConfigUtil as Config
from . import RequestUtil as Request
from . import ToolsUtil as Tools
from . import GetAllMomentsUtil as GetAllMoments

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def _find_project_root():
    """从 quark/qqexport/ 向上找到项目根目录（含 assets/data/dt.json）"""
    path = os.path.dirname(os.path.abspath(__file__))
    for _ in range(4):
        path = os.path.dirname(path)
        if os.path.isfile(os.path.join(path, 'assets', 'data', 'dt.json')):
            return path
    return None


PROJECT_ROOT = _find_project_root()
DT_JSON_PATH = os.path.join(PROJECT_ROOT, 'assets', 'data', 'dt.json') if PROJECT_ROOT else None


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
    """解析 dt.json 中最新的日期，返回 date 对象；文件不存在或为空则返回 None"""
    if not DT_JSON_PATH or not os.path.isfile(DT_JSON_PATH):
        return None
    try:
        with open(DT_JSON_PATH, 'r', encoding='utf-8') as f:
            entries = json.load(f)
        if not entries:
            return None
        date_str = entries[0].get('date', '')
        if not date_str:
            return None
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except (json.JSONDecodeError, ValueError, IndexError):
        return None


def _compute_next_id(existing_entries, date_key):
    """计算给定日期的下一个可用序号"""
    max_seq = 0
    for entry in existing_entries:
        eid = entry.get('id', '')
        prefix = f"{date_key}-"
        if eid.startswith(prefix):
            try:
                seq = int(eid[len(prefix):])
                max_seq = max(max_seq, seq)
            except ValueError:
                pass
    return max_seq + 1


def generate_json_entries(posts, existing_entries):
    """生成新说说的 JSON 条目列表（reverse chronological）"""
    if not posts:
        return None

    posts_sorted = sorted(
        posts,
        key=lambda x: _parse_message_time(x[0]) or datetime.min,
        reverse=True
    )

    new_entries = []
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

        content = body or ""

        # 收集全部图片 URL（前端展示限9张，画廊可浏览全部）
        img_urls = str(item[2]).split(",")
        images = [
            url.strip() for url in img_urls
            if url.strip().startswith("http")
        ]
        if len(images) > 0:
            print(f"  📷 {title} ({date_text}) → {len(images)} 张图片")

        # 计算ID
        seq = _compute_next_id(existing_entries, date_text)
        entry_id = f"{date_text}-{seq}"

        new_entries.append({
            "id": entry_id,
            "title": title,
            "date": date_text,
            "content": content,
            "images": images,
        })

    return new_entries


def run(verbose=True):
    if not PROJECT_ROOT:
        print("错误：找不到项目根目录（找不到 assets/data/dt.json）")
        sys.exit(1)

    # 1. 自动确定日期范围
    latest = get_latest_date_in_dt()
    today_date = date.today()

    if latest:
        start_dt = datetime.combine(latest + timedelta(days=1), datetime.min.time())
        if start_dt.date() > today_date:
            print("dt.json 已有最新数据，无需更新")
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

    # 3.5 补充全部图片（列表接口只返回前9张，通过详情接口获取全部图片）
    # 注意：列表API用 url1(缩略图)，详情API用 url3(原图)，URL格式不同，
    # 因此直接替换为详情结果即可——URL不重复，且质量更高
    uin = Request.get_uin()
    for item in texts:
        tid = item[4] if len(item) > 4 else ''
        if not tid or not item[2]:
            continue
        old_urls = item[2].split(',')
        old_count = len(old_urls)
        print(f"  [DEBUG] 说说{tid}: 列表API有{old_count}张 (首张: {old_urls[0][:60] if old_urls else '无'})")
        all_pics = GetAllMoments.get_moment_all_pictures(uin, tid)
        if all_pics is not None and len(all_pics) > 0:
            if len(all_pics) > old_count:
                print(f"  ✅ 详情API补充图片: {old_count}→{len(all_pics)}张 (首张: {all_pics[0][:60]})")
                item[2] = ','.join(all_pics)
            else:
                print(f"  ⏭ 详情API仅{len(all_pics)}张，未超列表API的{old_count}张，跳过替换")
        else:
            print(f"  ⚠ 详情API返回{all_pics}，无法补充")

    # 4. 加载现有条目
    existing_entries = []
    if DT_JSON_PATH and os.path.isfile(DT_JSON_PATH):
        try:
            with open(DT_JSON_PATH, 'r', encoding='utf-8') as f:
                existing_entries = json.load(f)
        except json.JSONDecodeError:
            existing_entries = []

    # 5. 生成新条目
    new_entries = generate_json_entries(texts, existing_entries)
    if not new_entries:
        print('没有找到新的说说')
        return

    if verbose:
        print(f'\n导出成功，共 {len(new_entries)} 条说说')

    # 6. 合并（新内容在最前）
    combined = new_entries + existing_entries

    with open(DT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)
        f.write("\n")

    if verbose:
        print(f'已合并更新至 {DT_JSON_PATH}')
