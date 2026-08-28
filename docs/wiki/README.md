# Maltose Wiki

面向想使用/部署 Maltose 主题（Headless WordPress + Astro）的用户的文档集合。

| 文档 | 内容 |
|---|---|
| [FAQ](./faq/index.md) | 常见问题排查（每篇独立成文） |
| [部署指南](./deployment.md) | 反向代理（nginx/frp）、Docker 化、CI/CD 部署配置 |
| [CI/CD 部署与 SSH 安全](../deploy/README.md) | GitHub Actions 双环境部署 + 受限 SSH key 白名单 |
| [ADR 决策记录](../adr/) | 架构决策（`0001`–`0036`），load-bearing：`0024`/`0026`/`0033`/`0034`/`0036` |
| [术语表](../glossary/) | 领域术语（评论、缓存、安全、时间轴等） |

## FAQ 索引

- [评论 IP 地理位置链路（配置与排障）](./faq/comment-ip-chain.md)

## 快速导航

- 部署一个 Maltose 站点 → [部署指南](./deployment.md)
- 评论地理定位（country/province）不生效 → [FAQ：评论 IP 链路](./faq/comment-ip-chain.md)
- 想了解评论 geo 如何实现 → [ADR-0026](../adr/0026-site-stats-dashboard.md) + [glossary/comment-message](../glossary/comment-message.md)
