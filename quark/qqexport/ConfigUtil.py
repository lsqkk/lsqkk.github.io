import os

QQEXPORT_DIR = os.path.dirname(os.path.abspath(__file__))
RESOURCE_DIR = os.path.join(QQEXPORT_DIR, 'resource')

temp_path = os.path.join(RESOURCE_DIR, 'temp') + '/'
user_path = os.path.join(RESOURCE_DIR, 'user') + '/'
result_path = os.path.join(RESOURCE_DIR, 'result') + '/'
cache_path = os.path.join(RESOURCE_DIR, 'fetch-all') + '/'


def save_user(cookies):
    with open(os.path.join(user_path, str(cookies.get('uin'))), 'w') as f:
        f.write(str(cookies))


def init_flooder():
    os.makedirs(temp_path, exist_ok=True)
    os.makedirs(user_path, exist_ok=True)
    os.makedirs(result_path, exist_ok=True)
    os.makedirs(cache_path, exist_ok=True)


def read_files_in_folder():
    files = os.listdir(user_path)
    if not files:
        return None
    print("已登录用户列表:")
    for i, file in enumerate(files):
        print(f"{i + 1}. {file}")

    while True:
        try:
            choice = int(input("请选择要登录的用户序号，重新登录输入0: "))
            if 1 <= choice <= len(files):
                break
            elif choice == 0:
                return None
            else:
                print("无效的选择，请重新输入。")
        except ValueError:
            print("无效的选择，请重新输入。")

    selected_file = files[choice - 1]
    file_path = os.path.join(user_path, selected_file)
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
    return content
