import json
import os
import time


def show_author_info():
    CYAN = '\033[36m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    RESET = '\033[0m'
    RED = '\033[31m'

    author_art = r'''
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓███████▓▒░  ░▒▓███████▓▒░   ░▒▓██████▓▒░  ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓███████▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓███████▓▒░  ░▒▓███████▓▒░  ░▒▓████████▓▒░ ░▒▓████████▓▒░ ░▒▓███████▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓█▓▒░        ░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░
░▒▓████████▓▒░ ░▒▓█▓▒░ ░▒▓███████▓▒░  ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░░▒▓█▓▒░ ░▒▓█▓▒░
'''

    print(CYAN + author_art + RESET)
    author_info = f"{YELLOW}bilibili{RESET} {BLUE}@高数带我飞{RESET} {YELLOW}GetQzonehistory V1.0{RESET}"
    print(author_info)
    print(f'{RED}程序完全免费，且在GitHub开源！！！！{RESET}')
    print(f'{RED}程序完全免费，且在GitHub开源！！！！{RESET}')
    print(f'{RED}程序完全免费，且在GitHub开源！！！！{RESET}')


def format_timestamp(timestamp):
    time_struct = time.localtime(timestamp)
    return time.strftime("%Y年%m月%d日 %H:%M:%S", time_struct)


def is_valid_json(json_data):
    try:
        json.loads(json_data)
        return True
    except ValueError:
        return False


def write_txt_file(workdir, file_name, data):
    if not os.path.exists(workdir):
        os.makedirs(workdir)
    base_path_file_name = os.path.join(workdir, file_name)
    with open(base_path_file_name, 'w', encoding='utf-8') as file:
        file.write(data)


def read_txt_file(workdir, file_name):
    base_path_file_name = os.path.join(workdir, file_name)
    if os.path.exists(base_path_file_name):
        with open(base_path_file_name, 'r', encoding='utf-8') as file:
            return file.read()
    return None


def get_content_from_split(content):
    content_split = str(content).split("：")
    return content_split[1].strip() if len(content_split) > 1 else content.strip()
