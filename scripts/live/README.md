# 夸克直播间

观看页由 Astro 构建。原站 `/a/live/` 和 ECS 上的 `https://live.130923.xyz/a/live/` 共用播放流及聊天。OBS 通过加密 SRT 向 MediaMTX 发布一路视频，观众通过 Caddy 提供的 HTTPS/HLS 播放。

## 开播

1. 在 DNS 中添加 `live` 的 A 记录，指向 ECS 公网 IPv4，选择仅 DNS。安全组开放 TCP 443 和 UDP 8890，后者可限制为主播的公网 IP。Caddy 在 TCP 443 上完成 TLS-ALPN 验证并自动续期。
2. 登录 ECS 后，执行 `sudo cat /etc/quark-live/obs-url`。把完整地址填入 OBS 的「设置 → 直播 → 自定义 → 服务器」，串流密钥留空。地址包含推流密码。
3. 选择 H.264 和 AAC，关键帧间隔设为 2 秒。可从 720p30 开始，码率取决于 ECS 出口和观众数。2.5 Mbps 的总码率在 20 人同时观看时约占 50 Mbps 出口，另需留出协议开销。
4. 点「开始直播」，然后打开观看页确认声音和画面。开播状态从 MediaMTX 获取。标准 HLS 会有几秒缓冲，聊天和视频可能存在时间差。

## 部署和维护

- `install.sh` 接受官方 MediaMTX v1.21.3 Linux AMD64 压缩包。脚本校验 SHA-256，保存长期 SRT 密码，并安装 `quark-mediamtx`、`quark-live-room` 两个 systemd 服务及独立的 Caddy 站点配置。它依赖现有 Caddy 的 `/etc/caddy/sites/*.caddy` 导入规则。
- 更新 ECS 观看页时，在仓库执行 `npm run build`，然后运行 `node scripts/live/pack-site.mjs <空输出目录>`。将输出目录的内容发布到 ECS 的 `/var/www/quark-live`，用带尾斜杠的 `/a/live/` 验证。
- 服务健康检查为 `https://live.130923.xyz/api/room`。未开播时返回 `live: false`。媒体管理接口和内部 HTTP 端口只监听回环地址。
- 聊天仅在开播期间接收消息，每场最多保留最近 60 条，服务重启会清空。需要暂停聊天时，在 `/etc/quark-live/room.env` 设置 `QUARK_CHAT=0`，再重启 `quark-live-room`。
- 要轮换推流密码，先停播，在服务器上更新 `/etc/quark-live/srt-passphrase` 为新的 32 位小写十六进制随机值，保持权限 `0600`，再重新执行安装脚本并更新 OBS。
