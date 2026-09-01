# 术语表 (Glossary) — 用户自助区与网关鉴权

## 用户自助区（User Self-Service）

前端（Astro）中供普通登录用户自助操作的页面区域，包括"我的评论"（`/user/comments`）和"资料编辑"（`/user/profile`）。区别于 WP 后台（管理员全站管理）。**原则**：自助区只允许用户操作自己的数据（自己的评论、自己的资料），不做全站管理。

## 资料真相源（Profile Source of Truth）

用户资料（显示名/网站链接/简介）的权威存储位置。本项目选定 **WordPress User**（ADR-0030）：资料存 WP 用户表，评论作者资料天然一致；Authentik 只做认证（"你是谁"），WP 管资料（"你长什么样"）。

## websiteUrl（WP 用户网站链接）

WPGraphQL `User` 类型字段（"the user's URL for the user's web site"）。用户可在资料编辑页填写自己的网站链接，评论作者展示时读取。**这是"匿名评论填 link"需求在登录架构下的落地**——登录用户填 websiteUrl，而非匿名填 link。

## isOwn（评论归属校验）

判断一条评论是否属于当前登录用户：`author.node.databaseId === wpUserId`。用于评论区的编辑/删除按钮显隐，以及 UserComments 自助操作。`wpUserId` 来自 wp_token 解码（middleware.ts）。

## 网关 mutation 鉴权（Gateway Mutation Auth）

`graphql-proxy.ts` 的统一鉴权：**任何 mutation 必须携带 `Authorization: Bearer <wp_token>`**，未登录返回 403。这是第一道防线；`BLOCKED_PATTERNS`（内容级拦截，如 updatePost/updateSettings/deleteUser）是第二道防线——已登录用户也不能碰全站内容管理。

## BLOCKED_PATTERNS（内容级拦截）

`graphql-proxy.ts` 中正则列表，硬拦截所有内容管理 mutation：文章/页面/媒体/分类/标签/设置/插件/主题/用户增删。**当前架构边界**："Astro 只读内容 + 只写评论/浏览量"的强制点。ADR-0030 仅精确放行 `updateUser`（自助资料），其余保持拦截。

## 双重防线（Defense in Depth）

网关对写操作的两层保护：① mutation 需登录（proxy 统一校验 token）；② BLOCKED_PATTERNS 内容级拦截。即使攻击者伪造了合法 token，也无法执行内容管理 mutation——只有评论/资料/浏览量写操作在授权范围内。
