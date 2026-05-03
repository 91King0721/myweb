# 整学期空闲教室查询系统

一个查看全校教室空闲情况的交互式课表查询工具，拥有 Apple 风格现代化界面。

## 项目结构

```
├── index.html              # 欢迎页（一级菜单入口）
├── query.html              # 空闲教室查询页（核心功能）
├── CNAME                   # 自定义域名绑定
├── README.md
├── .gitignore
└── assets/
    ├── css/
    │   └── style.css       # 全局样式（Apple 风格）
    └── js/
        ├── data.js         # 课程数据（周次 × 教学楼 × 教室）
        └── app.js          # 查询逻辑（渲染表格）
```

## 功能

- **欢迎页**：一级菜单入口，提供"查询空闲教室"入口
- **教室查询**：按周次和教学楼筛选，支持教室名称搜索
- **空闲统计**：直观展示每天的空闲教室数量
- **响应式设计**：完美适配桌面端和移动端

## 本地开发

直接在浏览器打开 `index.html` 即可使用，无需构建工具。

## 部署

部署到 GitHub Pages：

```bash
git init
git add .
git commit -m "初始化项目"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在 GitHub 仓库的 Settings > Pages 中选择 `main` 分支，选择根目录 `/` 即可。
