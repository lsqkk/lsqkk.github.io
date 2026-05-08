import re
import requests
import json

from . import LoginUtil as Login

_cookies = None
_g_tk = None
_uin = None


def _ensure_login():
    global _cookies, _g_tk, _uin
    if _cookies is None:
        _cookies = Login.cookie()
        _g_tk = Login.bkn(_cookies.get('p_skey'))
        _uin = re.sub(r'o0*', '', _cookies.get('uin'))


def get_cookies():
    _ensure_login()
    return _cookies


def get_g_tk():
    _ensure_login()
    return _g_tk


def get_uin():
    _ensure_login()
    return _uin


def get_login_user_info():
    _ensure_login()
    headers = {
        'authority': 'user.qzone.qq.com',
        'accept': ('text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,'
                   'image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'),
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'user-agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                       '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'),
    }
    response = requests.get(
        'https://r.qzone.qq.com/fcg-bin/cgi_get_portrait.fcg?g_tk=' + str(_g_tk) + '&uins=' + _uin,
        headers=headers, cookies=_cookies)
    info = response.content.decode('GBK')
    info = info.strip().lstrip('portraitCallBack(').rstrip(');')
    info = json.loads(info)
    return info
