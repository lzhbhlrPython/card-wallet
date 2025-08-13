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

## [Unreleased]
### Planned / Ideas
- bank_fallback.svg 通用占位符及构建时缺失校验。
- FPS 银行列表远程动态同步或缓存过期策略。
- 前端抽取 bankLogo 到 util 并添加单元测试。
- 事务性错误模拟测试（Purge 回滚场景、并发一致性）。
