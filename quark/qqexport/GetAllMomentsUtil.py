import json
import math
import os
import re
import time
from datetime import datetime, timedelta

import requests
from tqdm import tqdm

from . import RequestUtil as Request
from . import LoginUtil
from . import ToolsUtil as Tool
from . import ConfigUtil as Config


def _get_workdir():
    qq = Request.get_uin()
    return os.path.join(Config.cache_path, qq)


def get_user_qzone_info(page_size, offset=0):
    url = 'https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6'
    cookies = Request.get_cookies()
    g_tk = LoginUtil.bkn(cookies.get('p_skey'))
    qqNumber = Request.get_uin()
    skey = cookies.get('skey')
    p_uin = cookies.get('p_uin')
    pt4_token = cookies.get('pt4_token')
    p_skey = cookies.get('p_skey')
    headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cookie': f'uin={p_uin};skey={skey};p_uin={p_uin};pt4_token={pt4_token};p_skey={p_skey}',
        'priority': 'u=1, i',
        'referer': f'https://user.qzone.qq.com/{qqNumber}/main',
        'sec-ch-ua': '"Not;A=Brand";v="24", "Chromium";v="128"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    }

    params = {
        'uin': f'{qqNumber}',
        'ftype': '0',
        'sort': '0',
        'pos': f'{offset}',
        'num': f'{page_size}',
        'replynum': '100',
        'g_tk': f'{g_tk}',
        'callback': '_preloadCallback',
        'code_version': '1',
        'format': 'jsonp',
        'need_private_comment': '1'
    }
    try:
        response = requests.get(url, headers=headers, params=params)
    except Exception as e:
        print(e)
    rawResponse = response.text
    raw_txt = re.sub(r'^_preloadCallback\((.*)\);?$', r'\1', rawResponse, flags=re.S)
    json_dict = json.loads(raw_txt)
    if json_dict['code'] != 0:
        print(f"错误 {json_dict['message']}")
        return None
    return json.dumps(json_dict, indent=2, ensure_ascii=False)


def get_moment_all_pictures(uin, tid):
    """获取单条说说的全部图片（列表接口只返回前9张，需通过详情接口获取全部）"""
    cookie_jar = Request.get_cookies()
    g_tk = Request.get_g_tk()
    url = "https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msgdetail_v6"

    cookie_str = '; '.join([f'{k}={v}' for k, v in cookie_jar.items()])

    headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cookie': cookie_str,
        'referer': f'https://user.qzone.qq.com/{uin}/main',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    }
    params = {
        "uin": uin,
        "tid": tid,
        "g_tk": g_tk,
        "format": "jsonp",
        "callback": "_preloadCallback",
    }
    all_urls = []
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        raw = resp.text.strip()
        if raw.startswith('_preloadCallback('):
            raw = re.sub(r'^_preloadCallback\((.*)\);?$', r'\1', raw, flags=re.S)
        data = json.loads(raw)

        # 探索API响应结构
        print(f"    [DEBUG] 响应顶层keys: {list(data.keys())}")
        pic_list = data.get('pic')
        pictotal = data.get('pictotal', 0)
        if isinstance(pic_list, list) and len(pic_list) > 0:
            print(f"    [DEBUG] pic[0]类型={type(pic_list[0]).__name__}, pic[0]keys={list(pic_list[0].keys()) if isinstance(pic_list[0], dict) else 'not dict'}")
            print(f"    [DEBUG] 🖼️ pic[0] url1={pic_list[0].get('url1','')[:80] if isinstance(pic_list[0], dict) else pic_list[0][:80]}")
        other_pic_fields = {k: data.get(k) for k in ('albumid','albumname','total','lloc','sloc','photos') if k in data}
        print(f"    [DEBUG] 其他图片相关字段: {other_pic_fields}")
        # 检查 conlist 是否包含全部图片
        conlist = data.get('conlist')
        if conlist:
            print(f"    [DEBUG] conlist类型={type(conlist).__name__}, len={len(conlist) if isinstance(conlist, (list,dict)) else '?'}")
        # 打印 pic_template
        print(f"    [DEBUG] pic_template={data.get('pic_template')}")
        if not isinstance(pic_list, list):
            return None  # 响应格式不对，放弃补充

        def _extract(pics):
            urls = []
            for pic in pics:
                if isinstance(pic, str):
                    urls.append(pic)
                else:
                    for k in ('url3', 'url2', 'url1'):
                        v = pic.get(k)
                        if v:
                            urls.append(v)
                            break
            return urls

        all_urls = _extract(pic_list)

        # 从图片URL中提取相册ID前缀
        # URL格式: https://photonjmaz.photo.store.qq.com/psc?/ALBUM_ID/PHOTO_KEY
        album_prefix = None
        if pic_list and isinstance(pic_list[0], dict):
            u = pic_list[0].get('url1', '')
            if '/psc?/' in u:
                parts = u.split('/psc?/')
                if len(parts) > 1 and '/' in parts[1]:
                    album_prefix = parts[1].split('/')[0]
                    print(f"    [DEBUG] 推测相册ID: {album_prefix}")

        # 如果详情API取不够，试相册API
        if len(all_urls) < pictotal and album_prefix:
            print(f"    [DEBUG] 详情API只取到{len(all_urls)}张，尝试相册API...")
            album_url = "https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_photolist_v6"
            album_params = {
                "uin": uin,
                "albumid": album_prefix,
                "pos": "0",
                "num": str(pictotal),
                "g_tk": Request.get_g_tk(),
                "format": "jsonp",
                "callback": "_preloadCallback",
            }
            try:
                resp = requests.get(album_url, headers=headers, params=album_params, timeout=15, allow_redirects=False)
                raw = resp.text.strip()
                print(f"    [DEBUG] 相册API HTTP {resp.status_code}, 响应前200字符: {raw[:200]}")
                if raw.startswith('_preloadCallback('):
                    raw = re.sub(r'^_preloadCallback\((.*)\);?$', r'\1', raw, flags=re.S)
                album_data = json.loads(raw)
                print(f"    [DEBUG] 相册API返回code={album_data.get('code')}, keys={list(album_data.keys())}")
                album_pics = album_data.get('photos') or album_data.get('pic') or album_data.get('photoList') or []
                if album_pics and isinstance(album_pics, list) and len(album_pics) > len(all_urls):
                    print(f"    [DEBUG] 相册API返回{len(album_pics)}张图片!")
                    all_urls = _extract(album_pics[:pictotal])
            except Exception as e:
                print(f"    [DEBUG] 相册API请求失败: {e}")

        # 去重
        seen = set()
        deduped = []
        for url in all_urls:
            if url not in seen:
                seen.add(url)
                deduped.append(url)
        if len(deduped) != len(all_urls):
            print(f"    [DEBUG] 去重移除{len(all_urls) - len(deduped)}个重复URL")
        print(f"    [DEBUG] 详情API共返回{len(deduped)}张不重复图片")
        return deduped
    except Exception as e:
        print(f"获取说说 {tid} 详情失败: {e}")
        if resp is not None:
            print(f"  HTTP {resp.status_code}, body: {resp.text[:300]}")
        return None


def get_visible_moments_list(start_dt=None, end_dt=None):
    WORKDIR = _get_workdir()
    USER_QZONE_INFO = 'user_qzone_info.json'
    QZONE_MOMENTS_ALL = 'qzone_moments_all.json'

    user_qzone_info = Tool.read_txt_file(WORKDIR, USER_QZONE_INFO)
    if not user_qzone_info:
        qq_userinfo_response = get_user_qzone_info(1)
        if not qq_userinfo_response:
            print("获取QQ空间信息失败")
            return None
        Tool.write_txt_file(WORKDIR, USER_QZONE_INFO, qq_userinfo_response)
        user_qzone_info = Tool.read_txt_file(WORKDIR, USER_QZONE_INFO)

    if not Tool.is_valid_json(user_qzone_info):
        print("获取QQ空间信息失败")
        return None
    json_dict = json.loads(user_qzone_info)
    total_moments_count = json_dict['total']
    print(f'未删除说说总条数{total_moments_count}')

    if total_moments_count == 0:
        return None

    use_cache = start_dt is None and end_dt is None
    qzone_moments_all = None if not use_cache else Tool.read_txt_file(WORKDIR, QZONE_MOMENTS_ALL)
    if not qzone_moments_all:
        default_page_size = 30
        total_page_num = math.ceil(total_moments_count / default_page_size)
        all_page_data = []
        stop_fetch = False
        for current_page_num in range(0, total_page_num):
            pos = current_page_num * default_page_size
            qq_userinfo_response = get_user_qzone_info(default_page_size, pos)
            if not qq_userinfo_response:
                continue
            current_page_data = json.loads(qq_userinfo_response)["msglist"]
            if current_page_data:
                for item in current_page_data:
                    created_dt = None
                    if 'created_time' in item:
                        created_dt = datetime.fromtimestamp(item['created_time'])
                    if start_dt is not None and created_dt is not None and created_dt < start_dt:
                        stop_fetch = True
                        continue
                    if end_dt is not None and created_dt is not None and created_dt > (end_dt + timedelta(days=1)):
                        continue
                    all_page_data.append(item)
            time.sleep(0.02)
            if stop_fetch:
                break
        qq_userinfo = json.dumps({"msglist": all_page_data}, ensure_ascii=False, indent=2)
        if use_cache:
            Tool.write_txt_file(WORKDIR, QZONE_MOMENTS_ALL, qq_userinfo)
        qzone_moments_all = qq_userinfo

    if not Tool.is_valid_json(qzone_moments_all):
        print("获取QQ空间说说失败")
        return None
    json_dict = json.loads(qzone_moments_all)
    qzone_moments_list = json_dict['msglist']
    print(f'已获取到数据的说说总条数{len(qzone_moments_list)}')

    texts = []
    for item in tqdm(qzone_moments_list, desc="获取未删除说说", unit="条"):
        content = item['content'] if item['content'] else ""
        nickname = item['name']
        create_time = Tool.format_timestamp(item['created_time'])

        if start_dt is not None or end_dt is not None:
            created_dt = datetime.fromtimestamp(item['created_time'])
            if start_dt is not None and created_dt < start_dt:
                continue
            if end_dt is not None and created_dt > (end_dt + timedelta(days=1)):
                continue

        pictures = ""
        if 'pic' in item:
            for picture in item['pic']:
                pictures += picture['url1'] + ","
        if 'video' in item:
            for picture in item['video']:
                pictures += picture['url1'] + ","
        pictures = pictures[:-1] if pictures != "" else pictures

        comments = []
        if 'commentlist' in item:
            for commentToMe in item['commentlist']:
                comment_content = commentToMe['content']
                comment_create_time = commentToMe['createTime2']
                comment_nickname = commentToMe['name']
                comment_uin = commentToMe['uin']
                comments.append([comment_create_time, comment_content, comment_nickname, comment_uin])

        texts.append([create_time, f"{nickname} ：{content}", pictures, comments, item.get('tid', '')])
    return texts
