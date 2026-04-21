#!/usr/bin/env python3
import subprocess
import sys


def main():
    args = [sys.executable, "-m", "quark.cli", "updatelog", *sys.argv[1:]]
    result = subprocess.run(args, check=False)
    if result.returncode == 0:
        print("提示: `assets/md/commits.py` 已兼容转发到 `quark updatelog`。")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
