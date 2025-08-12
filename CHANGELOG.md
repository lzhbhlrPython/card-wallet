# Changelog

## [1.0.0] - 2025-08-12
### Added
- 初始发布：Vue 3 + Vite 前端（登录、注册、2FA 设置、卡片列表、创建、详情、编辑、删除、备份、退出登录）。
- Express + SQLite 后端：用户注册/登录、JWT 鉴权、TOTP 双因素认证、卡片 CRUD、字段 AES-256-CBC 对称加密（独立 IV）。
- 卡组织自动识别：Visa / Mastercard (51–55, 2221–2720) / American Express / Discover / JCB / Maestro / UnionPay / MIR / Diners / T-Union / eCNY / Unknown。
- Luhn 校验（对特殊网络的豁免处理逻辑预留）。
- WebDAV 手动备份能力（前端表单 + 时间戳文件名）。
- 2FA 设置、验证、重置相关端点与页面流程。
- Python 测试脚本基础版本（批量生成多网络卡片并调用后端 API）。
- 发布包含 `.gitignore`（忽略数据库与敏感文件）与 GPLv3 LICENSE。 

### Changed
- README 标题与克隆命令统一为 “Card Wallet”。

## [1.1.0] - 2025-08-12
### Added
- 后端新增 `POST /cards/purge` 端点：需要主密码 + 2FA（若启用）以清空当前用户全部卡片。
- 前端导航栏新增红色“清空所有卡片”按钮，自定义模态输入主密码与 2FA 验证码。
- 测试脚本 `server_test.py` 增加 `--rounds` 参数支持多轮批量创建。

### Changed
- 测试脚本修正 Mastercard 2-series 生成逻辑，使用官方合法 BIN 区间 222100–272099，并保证 6 位 BIN。
- 后端 Mastercard 识别逻辑由正则改为数值范围判断，避免漏判 2-series 边界值。
- 测试脚本 eCNY CVV 固定为 000。
- README 文档更新 UI 与 Mastercard 说明。

### Security
- 清空端点要求双重验证，降低误操作或滥用风险。

## [Unreleased] (开发中 / NOT YET RELEASED)
### Added
- FPS (转数快) 账户管理（列表 / 创建 / 详情 / 编辑 / 删除）。
  - 新表 `fps_accounts`，字段：fps_id / recipient / bank / note / created_at。
  - `GET /fps` 返回精简列表（不含 note）。
  - `GET /fps/:id` 需 2FA，返回含 `note` 详情。
  - `POST /fps` 创建（当前不强制 2FA，与卡片创建策略一致）。
  - `PUT /fps/:id`、`DELETE /fps/:id` 需 2FA。
  - `GET /fps/banks` 预置银行列表（已提前路由，避免与 `/:id` 冲突）。
- 前端 FPS 列表、表单、详情、编辑页（Vue Router 路由：/fps /fps/new /fps/:id /fps/:id/edit）。
- FPS 备注 note 仅在详情/编辑（2FA 验证后）可见，列表不泄漏敏感信息。 
- Purge 扩展：清空操作现在同时删除 FPS 账户（卡片+FPS 信息）。
- 测试脚本增加 `--fps` / `--fps-banks`：每轮为所有预设/指定银行各创建一个 FPS 账户。

### Changed
- FPSList 页面样式重构对齐 CardList（统一按钮、网格、卡片组件视觉）。
- FPSForm 页面重构对齐 CardForm（容器、字段样式、按钮风格统一）。
- 修复 `/fps/banks` 被 `/fps/:id` 捕获导致 404 的问题：调整路由顺序。
- 新增 `POST /fps` 创建端点（此前遗漏）。
- 统一银行 Logo 命名规则：非字母数字转为下划线并大写，找不到时回退 `fps.png`。
- Purge 前端文案由“清空所有卡片”改为“清空信息”，提示包含 FPS 账户。
- 测试脚本 FPS 模式从单银行轮循修改为每轮覆盖全部银行。

### Security
- 保持与卡片相同的 2FA 访问策略：敏感字段 (note) 与修改/删除操作均需 2FA。

### Notes
- 以上功能尚未进入正式发布版本号 (>=1.1.0)，可能继续调整接口与字段。
- 发布前将进行额外测试与 README 稳定化。
