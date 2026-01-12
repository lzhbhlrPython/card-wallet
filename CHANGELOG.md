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

## [1.2.0] - 2025-08-13
### Added
- FPS (转数快) 账户管理：列表 / 创建 / 详情 (2FA) / 编辑 / 删除，全量后端 REST 接口与前端页面。
- 数据库新表 `fps_accounts`；列表不含 note，详情/编辑/删除需 2FA。
- Purge 扩展：清空操作同时删除 FPS 账户（返回删除计数）。
- 测试脚本新增 `--fps` / `--fps-banks` 选项：每轮为所有银行各创建 1 条 FPS 账户。
- 预置银行新增：NANYANG COMMERCIAL BANK。
- 银行 Logo 多级回退：优先 .svg，失败尝试同名 .png，再失败回退 `fps.png`。

### Changed
- FPS 列表与表单样式对齐卡片页面；统一按钮与栅格视觉。
- 修复 `/fps/banks` 被 `/fps/:id` 捕获的路由顺序问题。
- 新增 `POST /fps` 创建端点（补全 REST）。
- 银行 Logo 命名统一为：原名大写→非字母数字替下划线→转小写；前端按规则生成。
- Purge 前端文案改为“清空信息”，提示包含 FPS。
- 测试脚本 FPS 模式：由单银行轮循改为每轮覆盖全部银行。
- 增加前端 invalid token 处理：403 + "Invalid token" 或 401 自动登出跳转登录页并携带标记参数。

### Security
- 与卡片一致：FPS 详情 / 修改 / 删除 / note 访问均需 2FA。

### Notes
- 未来可能新增：占位 bank_fallback.svg、前端 util 抽取 bankLogo、自动校验缺失银行 SVG。

## [1.3.0] - 2026-01-12
### Added
- 后端新增 `cards.card_type` 列（枚举字符串），并在 API 层对其进行验证与网络特例强制处理（`tunion` → `transit`，`ecny` → `ecny_wallet_1..4`）。
- 前端：在卡片创建/编辑表单增加类型选择（中文显示，提交 English enum），`BankSelect` 增加 `readonly`/`allowCreate`/`allowClear` 支持以防止非法输入。
- 卡片详情保留为列表内弹窗查看（需 2FA）；独立路由 `/cards/:id` 已移除以避免重复入口点。
- 测试脚本 `server_test.py` 更新：创建测试卡时包含 `cardType` 并兼容特殊网络规则。

### Changed
- 卡片列表增加“类型”筛选与“按类型”排序，排序使用固定顺序：信用卡 / 借记卡 / 预付卡 / 公交卡 / 一类钱包 / 二类钱包 / 三类钱包 / 四类钱包。
- `CardItem` 调整展示布局：`类型` 在左侧，`有效期` 在右侧并列，字体权重与颜色统一以便快速识别。

### Notes
- 数据库兼容性：本次发布引入 `cards.card_type` 字段。服务端会在启动时尝试自动迁移以添加新列，但请务必先备份 `server/data/database.sqlite`。旧客户端（< v1.3.0）可能无法正确处理 `cardType` 字段；请同时升级前端和后端到 v1.3.0 以确保一致性。
 
## [1.3.1] - 2026-01-12
### Fixed / Changed
- 统一卡片详情页面 `类型` 与 `有效期` 的展示样式，使其与 FPS 列表中“收款人”样式一致（灰色、非加粗、字号略小），以便界面视觉统一与阅读流畅性。

### Notes
- 本次为样式调整的瑕疵修复，不涉及数据库结构变更。

### Planned / Ideas

## [1.3.2] - 2026-01-12
### Added
- 在卡片记录中新增 `cardholder`（持卡人姓名，加密存储）字段。
- 卡片详情弹窗视觉升级：基于卡片信息生成确定性的流体晕染式背景（近似柏林噪声风格的渐变）。

### Notes
- `cardholder` 为敏感字段，仅在卡片详情（需 2FA）中以明文展示并支持复制；列表界面不会暴露该字段。
- 数据库迁移：服务端在启动时会尝试添加新列以兼容旧数据库，请在升级前备份 `server/data/database.sqlite`。
