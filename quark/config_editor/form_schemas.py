"""
Quark 配置编辑器 — 表单 Schema 定义

每个 schema 描述一个 JSON 配置文件的结构，供前端渲染自然表单。
字段类型：
  text      — 单行文本
  textarea  — 多行文本
  number    — 数字
  toggle    — 开关
  select    — 下拉选择
  color     — 颜色选择器
  url       — URL 输入
  json      — 内嵌 JSON 编辑（小型代码编辑器）
  array     — 可增删的列表
  object    — 嵌套对象（递归渲染）
  keyval    — 键值对映射
"""

SCHEMAS = {}

# ── nav.json ────────────────────────────────────────────────────────
SCHEMAS['src/config/json/nav.json'] = {
    'title': '导航栏配置',
    'description': '配置全站导航栏的 logo、标题、菜单项和登录入口。',
    'sections': [
        {
            'title': 'Logo',
            'fields': {
                'logo.url': {'label': 'Logo 图片地址', 'type': 'url'},
                'logo.alt': {'label': 'Logo 替代文本', 'type': 'text'},
                'logo.style': {'label': 'Logo CSS 样式', 'type': 'textarea'},
            }
        },
        {
            'title': '站点标题',
            'fields': {
                'title.text': {'label': '中文标题', 'type': 'text'},
                'title.en': {'label': '英文标题', 'type': 'text'},
                'title.link': {'label': '标题链接', 'type': 'url'},
            }
        },
        {
            'title': '导航菜单项',
            'description': '左侧为菜单显示名称，右侧为跳转链接。target 可选 _self（当前页）或 _blank（新标签页）。',
            'type': 'array',
            'key': 'navItems',
            'item_schema': {
                'name': {'label': '名称', 'type': 'text'},
                'link': {'label': '链接', 'type': 'url'},
                'target': {'label': '打开方式', 'type': 'select', 'options': [
                    {'value': '_self', 'label': '当前页面'},
                    {'value': '_blank', 'label': '新标签页'}
                ]}
            }
        },
        {
            'title': '登录配置',
            'fields': {
                'login.url': {'label': '站内登录页 URL', 'type': 'url'},
                'login.githubUrl': {'label': 'GitHub OAuth 授权地址', 'type': 'url'},
                'login.turnstileSiteKey': {'label': 'Turnstile Site Key', 'type': 'text'},
            }
        }
    ]
}

# ── index.json ──────────────────────────────────────────────────────
SCHEMAS['src/config/json/index.json'] = {
    'title': '首页信息配置',
    'description': '配置首页个人信息、背景、联系方式、公告等。',
    'sections': [
        {
            'title': '基本信息',
            'fields': {
                'Nickname': {'label': '昵称', 'type': 'text'},
                'Background': {'label': '背景图片', 'type': 'url'},
                'welcomeTitle': {'label': '欢迎标题', 'type': 'text', 'description': '首页大标题'},
                'welcomeText': {'label': '欢迎副标题', 'type': 'text', 'description': '首页副标题或描述'},
            }
        },
        {
            'title': '联系方式',
            'fields': {
                'Contact.email': {'label': '邮箱', 'type': 'text'},
                'Contact.phone': {'label': '电话', 'type': 'text'},
                'Contact.cv': {'label': '简历链接', 'type': 'url'},
                'Contact.academic': {'label': '学术主页链接', 'type': 'url'},
            }
        },
        {
            'title': '展示数量',
            'fields': {
                'showDynamicNum': {'label': '动态展示条数', 'type': 'number'},
                'showPostNum': {'label': '文章展示条数', 'type': 'number'},
                'showLogNum': {'label': '更新日志展示条数', 'type': 'number'},
            }
        },
        {
            'title': '地理位置',
            'fields': {
                'bloggerLat': {'label': '纬度', 'type': 'number'},
                'bloggerLon': {'label': '经度', 'type': 'number'},
            }
        },
        {
            'title': '公告',
            'fields': {
                'announcement.title': {'label': '公告标题', 'type': 'text'},
                'announcement.content': {'label': '公告内容 (支持 HTML)', 'type': 'textarea'},
            }
        },
        {
            'title': '社交链接',
            'description': '图标和链接地址',
            'type': 'array',
            'key': 'socialLinks',
            'item_schema': {
                'alt': {'label': '平台名称', 'type': 'text'},
                'icon': {'label': '图标地址', 'type': 'url'},
                'url': {'label': '链接', 'type': 'url'},
            }
        },
        {
            'title': '首页随机短语',
            'description': '首页打字机效果随机展示的短语，每行一条。',
            'type': 'array',
            'key': 'phrases',
            'item_schema': {
                'value': {'label': '短语', 'type': 'textarea'}
            },
            'flat': True
        },
        {
            'title': '欢迎提示语',
            'description': '首页 IP 检测后的随机欢迎语列表。',
            'type': 'array',
            'key': 'tips',
            'item_schema': {
                'value': {'label': '欢迎语', 'type': 'textarea'}
            },
            'flat': True
        }
    ]
}

# ── index_config.json ───────────────────────────────────────────────
SCHEMAS['src/config/json/index_config.json'] = {
    'title': '首页板块配置',
    'description': '控制首页各板块的显示与隐藏。',
    'sections': [
        {
            'title': '主内容区',
            'fields': {
                'main_content.avatar_nickname': {'label': '头像与昵称', 'type': 'toggle'},
                'main_content.contact_links': {'label': '联系方式', 'type': 'toggle'},
                'main_content.social_links': {'label': '社交链接', 'type': 'toggle'},
                'main_content.welcome_section': {'label': '欢迎区域', 'type': 'toggle'},
                'main_content.typewriter': {'label': '打字机效果', 'type': 'toggle'},
                'main_content.recent_articles': {'label': '最近文章', 'type': 'toggle'},
                'main_content.dynamic_feed': {'label': '站主动态', 'type': 'toggle'},
            }
        },
        {
            'title': '侧边栏',
            'fields': {
                'sidebar.datetime_display': {'label': '日期时间', 'type': 'toggle'},
                'sidebar.ip_greeting': {'label': 'IP 欢迎语', 'type': 'toggle'},
                'sidebar.greeting_tip': {'label': '随机提示', 'type': 'toggle'},
                'sidebar.online_preview': {'label': '在线预览', 'type': 'toggle'},
                'sidebar.github_promo': {'label': 'GitHub 推广', 'type': 'toggle'},
                'sidebar.latest_updates': {'label': '最近更新', 'type': 'toggle'},
                'sidebar.announcement': {'label': '公告', 'type': 'toggle'},
                'sidebar.latest_video': {'label': '最新视频', 'type': 'toggle'},
                'sidebar.comments': {'label': '评论', 'type': 'toggle'},
                'sidebar.friend_links': {'label': '友链', 'type': 'toggle'},
            }
        },
        {
            'title': '页脚',
            'fields': {
                'footer.visitor_stats': {'label': '访问统计', 'type': 'toggle'},
                'footer.copyright_info': {'label': '版权信息', 'type': 'toggle'},
                'footer.icp_record': {'label': 'ICP 备案', 'type': 'toggle'},
            }
        }
    ]
}

# ── friends.json ────────────────────────────────────────────────────
SCHEMAS['src/config/json/friends.json'] = {
    'title': '友链配置',
    'description': '管理博客友情链接列表。',
    'type': 'array',
    'root_array': True,
    'item_schema': {
        'nickname': {'label': '昵称', 'type': 'text'},
        'url': {'label': '网站地址', 'type': 'url'},
        'icon': {'label': '头像/图标地址', 'type': 'url'},
        'describe': {'label': '描述', 'type': 'text'},
    }
}

# ── api.json ────────────────────────────────────────────────────────
SCHEMAS['src/config/json/api.json'] = {
    'title': 'API 配置',
    'description': '后端 API 基础地址配置。',
    'sections': [
        {
            'fields': {
                'apiBase': {'label': 'API 基础地址', 'type': 'url', 'description': 'Vercel serverless 函数的部署域名'},
            }
        }
    ]
}

# ── manifest.json ───────────────────────────────────────────────────
SCHEMAS['src/config/json/manifest.json'] = {
    'title': 'PWA Manifest 配置',
    'description': 'PWA 应用清单，影响添加到主屏幕时的名称、图标和颜色。',
    'sections': [
        {
            'title': '应用信息',
            'fields': {
                'name': {'label': '应用全名', 'type': 'text'},
                'short_name': {'label': '短名称', 'type': 'text'},
                'en_name': {'label': '英文名称', 'type': 'text'},
                'description': {'label': '描述', 'type': 'textarea'},
                'start_url': {'label': '启动地址', 'type': 'url'},
                'display': {'label': '显示模式', 'type': 'select', 'options': [
                    {'value': 'standalone', 'label': '独立应用'},
                    {'value': 'fullscreen', 'label': '全屏'},
                    {'value': 'minimal-ui', 'label': '最小 UI'},
                    {'value': 'browser', 'label': '浏览器'}
                ]},
            }
        },
        {
            'title': '颜色',
            'fields': {
                'background_color': {'label': '背景色', 'type': 'color'},
                'theme_color': {'label': '主题色', 'type': 'color'},
            }
        },
        {
            'title': '图标',
            'type': 'array',
            'key': 'icons',
            'item_schema': {
                'src': {'label': '图标路径', 'type': 'url'},
                'sizes': {'label': '尺寸', 'type': 'text', 'description': '如 192x192'},
                'type': {'label': 'MIME 类型', 'type': 'text', 'description': '如 image/png'},
            }
        }
    ]
}

# ── popups.json ─────────────────────────────────────────────────────
SCHEMAS['src/config/json/popups.json'] = {
    'title': '弹窗配置',
    'description': '首页弹窗公告列表。startDate/endDate 格式为 YYYY-MM-DD。',
    'type': 'array',
    'root_array': True,
    'item_schema': {
        'id': {'label': 'ID', 'type': 'text'},
        'title': {'label': '标题', 'type': 'text'},
        'content': {'label': '内容 (支持 Markdown)', 'type': 'textarea'},
        'startDate': {'label': '开始日期', 'type': 'text'},
        'endDate': {'label': '结束日期', 'type': 'text'},
        'autoClose': {'label': '自动关闭(秒，0=不自动)', 'type': 'number'},
        'celebration': {'label': '庆典模式', 'type': 'toggle'},
        'backgroundColor': {'label': '背景色', 'type': 'color'},
        'textColor': {'label': '文字色', 'type': 'color'},
    }
}

# ── font.json ───────────────────────────────────────────────────────
SCHEMAS['src/config/json/font.json'] = {
    'title': '字体配置',
    'description': '配置站点的自定义字体来源与系统回退字族。',
    'sections': [
        {
            'title': '首选字体',
            'description': '按优先级排列，排在前面的字体优先加载。',
            'type': 'array',
            'key': 'preferred',
            'item_schema': {
                'family': {'label': '字体名称', 'type': 'text', 'description': 'CSS font-family 名称'},
                'source': {'label': '加载地址', 'type': 'url', 'description': 'CSS 文件的 CDN 地址'},
            }
        },
        {
            'title': '系统回退字体',
            'description': '当首选字体加载失败时依次尝试的系统字体。',
            'type': 'array',
            'key': 'systemFallbacks',
            'item_schema': {
                'value': {'label': '字体名称', 'type': 'text'},
            },
            'flat': True
        },
        {
            'title': '其他',
            'fields': {
                'includeAssetsFonts': {'label': '加载本地字体文件', 'type': 'toggle', 'description': '是否引入 assets/fonts 目录下的字体'},
            }
        }
    ]
}

# ── city-banter.json ────────────────────────────────────────────────
SCHEMAS['src/config/json/city-banter.json'] = {
    'title': '城市欢迎语配置',
    'description': '根据 IP 定位显示的城市特色问候语。键为省份/城市名，值为欢迎语。',
    'type': 'keyval',
    'key_label': '省份/城市',
    'value_label': '欢迎语',
}

# ── 通用分类列表 schema（functions / projects / games / tools）─────
CATEGORY_LIST_SCHEMA = {
    'type': 'array',
    'root_array': False,
    'key': 'categories',
    'item_schema': {
        'name': {'label': '分类名称', 'type': 'text'},
        'items': {
            'label': '项目列表',
            'type': 'array',
            'key_field': 'functions',
            'item_schema': {
                'name': {'label': '名称', 'type': 'text'},
                'description': {'label': '描述', 'type': 'textarea'},
                'link': {'label': '链接', 'type': 'url'},
                'target': {'label': '打开方式', 'type': 'select', 'options': [
                    {'value': '_self', 'label': '当前页'},
                    {'value': '_blank', 'label': '新标签页'},
                    {'value': '_target', 'label': '默认'}
                ]},
            }
        }
    }
}

SCHEMAS['assets/pages/blog/functions.json'] = {
    'title': '博客功能列表',
    'description': '管理"更多"页面的功能分类与入口。',
    'sections': [{'title': '功能分类', **CATEGORY_LIST_SCHEMA}]
}

SCHEMAS['assets/pages/a/projects.json'] = {
    'title': '实验室项目列表',
    'description': '管理"实验室"页面的项目分类与入口。',
    'sections': [{'title': '项目分类', 'key': 'categories', **CATEGORY_LIST_SCHEMA}]
}

# games/game.json uses top-level keys as categories
SCHEMAS['assets/pages/games/game.json'] = {
    'title': '游戏列表',
    'description': '管理"游戏"页面的游戏分类与入口。key 为分类标识。',
    'type': 'keyval_obj',
    'key_label': '分类标识',
    'value_schema': {
        'type': 'array',
        'item_schema': {
            'name': {'label': '名称', 'type': 'text'},
            'link': {'label': '链接', 'type': 'text'},
            'image': {'label': '图片', 'type': 'url'},
        }
    }
}

# tool/tool.json
SCHEMAS['assets/pages/tool/tool.json'] = {
    'title': '工具列表',
    'description': '管理"工具"页面的工具分类与入口。',
    'sections': [{'title': '工具分类', 'key': 'categories', **CATEGORY_LIST_SCHEMA}]
}


def get_schema(file_id):
    """根据文件路径获取表单 schema，无匹配时返回 None。"""
    # 直接匹配
    if file_id in SCHEMAS:
        return SCHEMAS[file_id]
    # 去掉前缀再匹配
    for key, schema in SCHEMAS.items():
        if file_id.endswith(key) or key.endswith(file_id):
            return schema
    return None


def list_schema_files():
    """返回所有已定义 schema 的文件路径列表。"""
    return list(SCHEMAS.keys())
