# Changelog

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
