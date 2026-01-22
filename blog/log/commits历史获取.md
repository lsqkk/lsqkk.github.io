# 提取
```bash
git log --since="2025-01-01" --until="2025-03-24" --pretty=format:"%H | %an | %ad | %s" --date=short > commits.txt
```

# 去除号码正则
\b[a-zA-Z0-9]{40}\b

# 去除无效提交信息正则
^.*111.*\r?\n