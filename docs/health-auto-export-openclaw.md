# Health Auto Export + OpenClaw + GitHub Pages

这个站点是公开的 GitHub Pages，只适合展示脱敏健康摘要，不适合保存 Apple 健康原始数据。

## 结论

- `https://779725539-bit.github.io/` 是静态网页，不能直接接收 Health Auto Export 的 REST API `POST`。
- 原始健康数据默认留在本机 OpenClaw 工作区。
- GitHub Pages 只展示 `health/latest-public.json` 里的公开摘要。

## 推荐链路

1. iPhone 的 Health Auto Export 导出 JSON 到 iCloud Drive。
2. Mac 同步 iCloud Drive 文件。
3. OpenClaw 读取原始 JSON，生成本机健康台账。
4. OpenClaw 额外生成脱敏公开摘要：

```text
/Users/zhanglin/.openclaw/agents/blackwidow/workspace/health/public/latest-public.json
```

5. 在本仓库运行：

```bash
node tools/publish-health-summary.mjs
git add health/latest-public.json
git commit -m "Update public health summary"
git push
```

## Health Auto Export 设置建议

- Automation Type: iCloud Drive
- Export Format: JSON
- Export Version: Version 2
- Date Range: Yesterday 或 Since Last Sync
- Summarize Data: ON
- Time Grouping: Days
- Metrics: 先只选睡眠、步数、静息心率、HRV、运动分钟、体重等核心指标

## 如果之后要 REST API

REST API 需要单独的后端入口，例如：

- Cloudflare Worker
- Vercel Function
- Supabase Edge Function
- 本机 Mac 局域网接收器

Health Auto Export 的 URL 可以填：

```text
https://your-endpoint.example.com/health/autoexport
```

并添加鉴权头：

```text
X-API-Key: <your-secret>
```

接收器收到原始数据后，不要直接写入公开仓库；应该先生成脱敏摘要，再更新 GitHub Pages。

## 不公开的数据

- 原始逐点心率
- 运动路线和 GPS 坐标
- 用药
- 症状
- 情绪状态
- ECG 原始数据
- 任何可识别精确生活节律的明细
