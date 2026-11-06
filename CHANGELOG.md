# 更新记录 / Changelog

## 0.3.0（未发布 / unreleased）

- 版本号：启动日志和 MCP 握手里报的都是 `package.json` 的版本；附带的服务报 javmem-mcp 的版本（记在 `mcp/package.json`，由 `scripts/vendor-mcp.mjs` 写入）。
- 配置写错会提示：同一个 Bot 既写 `memory` 又写 `memv2`/`javis` 时只挂 `memory` 一组（0.2.2 是两组都挂）；丢掉的设置、不认识的字段、找不到的文件、Tobs 里没有的 Bot 编号，各记一行警告，只写键名和路径。
- 兼容范围放宽到 DSH 1.0 以下（`engines.dsh` 和 `@deepseek-ai/dsh-tools` 的 peer 范围），每天用 DSH 的 latest 和 next 各跑一遍测试。
- 第一次发 npm（包名 `javmem-dsh-plugin`），GitHub Release 附安装包 `javmem-dsh-plugin.tgz`；附带 javmem-mcp 0.3.0。
- 新工具 `memory_status`：这个 Bot 挂了哪些记忆工具、每个库连不连得上、令牌能不能用、文件在不在、配置提醒、最近几次调用的耗时；不显示令牌和记忆内容（`statusTool: false` 可关）。
- README：开头一句话说清是什么，写明适合谁、不适合谁，三种装法（npm、Release 安装包、git）；英文版 `README.en.md` 和中文版内容对等；npm、CI、许可证徽章。

English:

- Versions: the start line in the log and the MCP handshake carry `package.json`'s version; the bundled servers report javmem-mcp's (recorded in `mcp/package.json` by `scripts/vendor-mcp.mjs`).
- Config mistakes are named: a Bot given both `memory` and `memv2`/`javis` gets the `memory` tools only (0.2.2 registered both); dropped settings, unknown fields, missing files and Bot ids Tobs does not know each get one warning line, with key names and paths only.
- DSH range widened to below 1.0 (`engines.dsh` and the `@deepseek-ai/dsh-tools` peer range); a daily workflow tests against DSH's latest and next.
- First npm release (`javmem-dsh-plugin`), a GitHub Release asset `javmem-dsh-plugin.tgz`; bundles javmem-mcp 0.3.0.
- New tool `memory_status`: the Bot's memory tools, whether each store answers and takes its token, its files, its config warnings and its last calls' times; no token and no memory text (`statusTool: false` turns it off).
- README: a one-line pitch, who it is for and not for, three ways to install (npm, Release tarball, git); `README.en.md` in English with the same content as the Chinese one; npm, CI and licence badges.

## 0.2.2

- `VERSION` 从 `package.json` 读；两套工具都写的 Bot 会被提醒；README 的「前提」写成白话。

English: `VERSION` read from `package.json`; a Bot given both tool sets is warned about; plain-language prerequisites.

## 0.2.1

- `@deepseek-ai/dsh-tools` 的 peer 范围给预发布版本单写分支，0.2.1-rc.3 在 npm 和 pnpm 下也能装。

English: explicit prerelease branches in the `@deepseek-ai/dsh-tools` peer range, so 0.2.1-rc.3 installs under npm and pnpm.

## 0.2.0

- 合起来的五个 `memory_*` 工具；修好 CommonJS 服务在本包里起不来的问题。

English: the five combined `memory_*` tools; a fix for the CommonJS servers not starting inside this package.

## 0.1.0

- 给列出的 Tobs Bot 挂 memv2 和 Javis 的只读工具。

English: read-only memv2 and Javis tools for the Tobs Bots you list.
