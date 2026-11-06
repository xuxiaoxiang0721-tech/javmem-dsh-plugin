# 发版步骤

给维护者看的。推送、打标签、发 GitHub Release、发 npm、改社区收录条目，都要仓库主人点头后再做；npm 由主人自己登录。

1. **附带的服务**：javmem-mcp 出了新版，先在那边发版，再运行 `node scripts/vendor-mcp.mjs <javmem-mcp 目录>`，把服务复制进 `mcp/`。
2. **改版本号**：`package.json` 的 `version`；在 `CHANGELOG.md` 最上面写这一版的变化（中英文各一段），标题写 `## <版本>`。
3. **提交，再打包**：`node scripts/pack.mjs`。它从已提交的内容打包，所以换行都是 LF；先跑 `node test/test-plugin.mjs`，再在 `dist/` 里生成：
   - `javmem-dsh-plugin-<版本>.tgz`：发 npm 用；
   - `javmem-dsh-plugin.tgz`：同一个文件，名字不带版本号，作为 GitHub Release 的附件；
   - `SHA256SUMS`；`release-notes.md`（这一版的更新记录，贴进 Release 说明）。
4. **推送并打标签**：
   ```bash
   git push origin main
   git tag v<版本>
   git push origin v<版本>
   ```
5. **发 GitHub Release**：仓库的 Releases 页 → Draft a new release → 选标签 `v<版本>`，标题 `v<版本>`，说明贴 `dist/release-notes.md`，附件传 `dist/javmem-dsh-plugin.tgz`。
6. **发 npm**：先 `npm login`（自己登录），再 `npm publish dist/javmem-dsh-plugin-<版本>.tgz`。
7. **社区收录条目**：在 awesome-dsh-plugin 的 `data/plugins/xuxiaoxiang0721-tech__javmem-dsh-plugin.yml` 里加一行（第一次发 Release 时加，以后不用改）：
   ```yaml
   tarball: https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/releases/latest/download/javmem-dsh-plugin.tgz
   ```
   附件名不带版本号，所以这个链接发下一版后也不会失效（社区规则：`latest/download/` 后面的文件名是照字面取的）。条目描述和插件的实际功能要对得上，功能变了就一起改描述。

   0.3.0 起，插件不再必须有 memv2 和 Javis，条目整份换成：

   ```yaml
   url: https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin
   name: xuxiaoxiang0721-tech/javmem-dsh-plugin
   category: memory
   tarball: https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/releases/latest/download/javmem-dsh-plugin.tgz
   description:
     en: 'Per-Bot memory for Tobs Bots that works as installed: a read-only local full-text index of each Bot''s own past conversations (Chinese words found inside sentences), memory imported from other AI tools, a status tool, optional auto recall before a step in which a Human speaks, and a service for other plugins. Richer backends can be chosen at install, with a quote first and a daily token cap: a public fact store (memv2-lite), the official Graphiti graph, or both, fed from the Bot''s own conversations.'
     zh: '给 Tobs Bot 的按 Bot 隔离的记忆，装上就能用：只读地把每个 Bot 自己的历史对话建成本地全文索引（中文词在整句里也能搜到），可导入从别的 AI 工具继承来的记忆，带状态工具、可选的自动召回（只在真人发言时）和给其他插件用的接口。安装时还可以选更立体的后端（先报价、每天有上限）：公开的事实库（memv2 精简版）、Graphiti 官方图谱，或两个一起，都从 Bot 自己的对话里抽取。'
   ```

## 装法（发版后）

- npm：DSH 网页插件页按包名 `javmem-dsh-plugin` 安装，或者 `dsh plugin --profile web add javmem-dsh-plugin`。
- Release 安装包：`dsh plugin --profile web add https://github.com/xuxiaoxiang0721-tech/javmem-dsh-plugin/releases/latest/download/javmem-dsh-plugin.tgz`。
- 这两种都不走 `git ls-remote`，网络受限、连不上 GitHub 的 git 服务时也能装。
