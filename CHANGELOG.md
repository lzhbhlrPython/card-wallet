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

## [Unreleased]
- 待补充
