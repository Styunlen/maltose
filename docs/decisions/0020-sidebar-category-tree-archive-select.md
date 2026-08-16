# ADR-0020: 侧边栏分类层级树 + 归档下拉框

## 状态

已接受

## 日期

2026-08-13

## 背景

ADR-0019 实现的侧边栏"文章分类"为平铺列表、"文章归档"为展开式列表。用户反馈需优化：

1. **分类展示层级关系**：博客分类存在父子层级（如 天荒遗痕 → 吐槽/忆梦集/登岸集/菜园集；披沙拣金 → 编程），平铺无法体现。
2. **归档改下拉框**：月度归档列表较长，改为下拉框更紧凑。
3. **归档位置**：移到标签云（TagCloud）区块下方。

## 需求

- 分类区块改为**可折叠树**（默认展开）：父分类可折叠，子分类缩进显示。
- 归档区块改为 **shadcn Select 下拉框**（`选择月份` 占位），选中后跳转 `?archive=YYYY-MM`。
- 归档区块移到标签云下方。

## 决策

### 1. 分类树数据

`megaQuery` 的 `allCategories` 增加 `parent` 和 `children` 字段：

```graphql
allCategories: categories(first: 100) {
  nodes {
    id
    name
    uri
    count
    parent {
      node {
        name
      }
    }
    children {
      nodes {
        name
      }
    }
  }
}
```

- `parent`：构建树（扁平 → 嵌套）。
- `children`：判断父分类是否有子项（可折叠标记）。

### 2. CategoryList 可折叠树

- 客户端用 `parent.name` 构建树：`{ 父分类: [子分类...] }`。
- 渲染：父分类为列表项（带折叠箭头），子分类缩进显示在其下方。
- 折叠状态：`useState<Set<string>>(默认展开所有父分类)`，点击父分类 toggle。
- 无子分类的分类保持平铺列表项。

### 3. ArchiveList 改 shadcn Select

- 用 `src/components/ui/select.tsx`（ADR-0016 已建）。
- `Select` 展示 `选择月份` 占位，选项为月度（`YYYY年M月 (N)`）。
- 选中后 `window.location.href = /?archive=YYYY-MM`。

### 4. 布局调整

HomepageSidebar 顺序：
```
CalendarWidget → TabsSection → CategoryList → TagCloud → ArchiveList
```
（ArchiveList 移到 TagCloud 之后）

## 数据流

```
megaQuery（allCategories 含 parent/children）
  └─ sidebarData.categories → CategoryList（树构建 + 折叠）
  └─ sidebarData.archivePosts → ArchiveList（Select 下拉 + 跳转）
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 平铺分类 | ADR-0019 现状 | 无层级 |
| 只查 parent 反推子项 | 少查询字段 | 需额外逻辑，children 更直接 |
| 原生 select | 简单 | 用户选 shadcn Select |

## 影响

### 前端
- `src/api/api.ts`：`megaQuery` 的 allCategories 增加 `parent`/`children`。
- `src/layouts/SidebarRight.tsx`：`CategoryList` 树形 + 折叠；`ArchiveList` 改 Select；布局顺序调整。

### 风险与注意
- 分类层级深度：当前仅 2 层（父→子），树构建按 parent 名分组即可；深层需递归。
- children 仅查 `name`（判断有无子项），不查完整子数据（子分类在 nodes 中已含，用 parent 关联）。
- Select 选中跳转是整页导航（SSR 重新渲染归档页）。

## 参考文献

- ADR-0019（侧边栏分类/归档）：`docs/decisions/0019-sidebar-categories-archive.md`
- ADR-0016（shadcn Select 组件）：`docs/decisions/0016-timeline-page.md`
- WPGraphQL `categories` 连接的 `parent`/`children` 字段
