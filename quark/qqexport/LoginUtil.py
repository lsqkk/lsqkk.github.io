import platform
import sys
import os
import subprocess
import time
import re

import requests

try:
    from pyzbar.pyzbar import decode as pyzbar_decode
    import qrcode
    from PIL import Image
    _qr_available = True
except Exception:
    _qr_available = False
    try:
        from PIL import Image
    except Exception:
        Image = None

from . import ConfigUtil as Config


def bkn(pSkey):
    t, n, o = 5381, 0, len(pSkey)
    while n < o:
        t += (t << 5) + ord(pSkey[n])
        n += 1
    return t & 2147483647


def ptqrToken(qrsig):
    n, i, e = len(qrsig), 0, 0
    while n > i:
        e += (e << 5) + ord(qrsig[i])
        i += 1
    return 2147483647 & e


def QR():
    url = 'https://ssl.ptlogin2.qq.com/ptqrshow?appid=549000912&e=2&l=M&s=3&d=72&v=4&t=0.8692955245720428&daid=5&pt_3rd_aid=0'

    try:
        r = requests.get(url)
        qrsig = requests.utils.dict_from_cookiejar(r.cookies).get('qrsig')

        qr_path = Config.temp_path + 'QR.png'
        with open(qr_path, 'wb') as f:
            f.write(r.content)

        print(time.strftime('%H:%M:%S'), '登录二维码获取成功')

        if _qr_available and Image:
            im = Image.open(qr_path)
            im = im.resize((350, 350))
            decoded_objects = pyzbar_decode(im)
            for obj in decoded_objects:
                qr = qrcode.QRCode()
                qr.add_data(obj.data.decode('utf-8'))
                qr.print_ascii(invert=True)
        else:
            print(f'请用手机QQ扫描二维码登录，二维码图片保存在: {qr_path}')

        return qrsig

    except Exception as e:
        print(f"获取二维码失败: {e}")
        return None


def cookie():
    Config.init_flooder()
    select_user = Config.read_files_in_folder()
    if select_user:
        return eval(select_user)

    qrsig = QR()
    if qrsig is None:
        print("获取二维码失败，退出登录")
        sys.exit(1)

    ptqrtoken = ptqrToken(qrsig)

    while True:
        url = ('https://ssl.ptlogin2.qq.com/ptqrlogin'
               '?u1=https%3A%2F%2Fqzs.qq.com%2Fqzone%2Fv5%2Floginsucc.html%3Fpara%3Dizone'
               '&ptqrtoken=' + str(ptqrtoken)
               + '&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-'
               + str(time.time()) + '&js_ver=20032614&js_type=1&login_sig=&pt_uistyle=40'
               '&aid=549000912&daid=5&')
        cookies = {'qrsig': qrsig}
        try:
            r = requests.get(url, cookies=cookies)
            if '二维码未失效' in r.text:
                pass
            elif '二维码认证中' in r.text:
                print(time.strftime('%H:%M:%S'), '二维码认证中')
            elif '二维码已失效' in r.text:
                print(time.strftime('%H:%M:%S'), '二维码已失效')
            elif '登录成功' in r.text:
                print(time.strftime('%H:%M:%S'), '登录成功')
                cookies = requests.utils.dict_from_cookiejar(r.cookies)
                uin = cookies.get('uin')
                regex = re.compile(r'ptsigx=(.*?)&')
                sigx = re.findall(regex, r.text)[0]
                url = ('https://ptlogin2.qzone.qq.com/check_sig'
                       '?pttype=1&uin=' + uin
                       + '&service=ptqrlogin&nodirect=0&ptsigx=' + sigx
                       + '&s_url=https%3A%2F%2Fqzs.qq.com%2Fqzone%2Fv5%2Floginsucc.html%3Fpara%3Dizone'
                       '&f_url=&ptlang=2052&ptredirect=100&aid=549000912&daid=5&j_later=0'
                       '&low_login_hour=0&regmaster=0&pt_login_type=3&pt_aid=0&pt_aaid=16'
                       '&pt_light=0&pt_3rd_aid=0')
                try:
                    r = requests.get(url, cookies=cookies, allow_redirects=False)
                    target_cookies = requests.utils.dict_from_cookiejar(r.cookies)
                    Config.save_user(target_cookies)
                    return target_cookies

                except Exception as e:
                    print(e)
            else:
                print(time.strftime('%H:%M:%S'), '用户取消登录')

        except Exception as e:
            print(e)

        time.sleep(3)
