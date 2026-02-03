from setuptools import setup, find_packages

setup(
    name="quark-blog",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "click>=8.0.0",
        "flask>=2.0.0",
    ],
    entry_points={
        "console_scripts": [
            "quark=quark.cli:cli",
        ],
    },
    author="蓝色奇夸克",
    description="博客管理命令行工具",
)