# Credit Card Manager (Vue + Express + Encrypted SQLite)

一个带本地加密、用户认证与双因素认证 (TOTP) 的信用卡/卡片信息管理示例应用。前端使用 Vue 3 + Vite + Pinia，后端使用 Express + SQLite，并提供基于 WebDAV 的手动远程备份能力。

## 功能特性
- 用户注册 / 登录（JWT 会话）
- 可选 TOTP 双因素认证（Speakeasy + 二维码）
- 卡号 / CVV / 有效期基于 AES-256-CBC 加密后存入 SQLite
- 自动识别多种卡组织 (Visa / Mastercard / Amex / UnionPay / Discover / JCB / Diners / Maestro / MIR / CHINA T-UNION / eCNY / 其它)
- 服务端校验卡号（含 Luhn 校验，特例：T-Union / eCNY）
- 列表仅展示末四位与必要元数据，详情接口需二次 2FA 验证
- 支持备注 note 字段
- WebDAV 手动备份数据库（时间戳命名）

## 目录结构
```
assets/            # 通用静态资源（卡组织 svg 等）
client/            # 前端 (Vue 3 + Vite)
  src/
  index.html
server/            # 后端 (Express)
  index.js
  data/            # 运行期生成的 SQLite 数据库 (被 .gitignore 忽略)
```

## 快速开始
### 1. 克隆与安装依赖
```bash
git clone <your-repo-url> credit_card_manager
cd credit_card_manager
# 安装前端
cd client && npm install && cd ..
# 安装后端
cd server && npm install && cd ..
```

### 2. 配置环境变量
在根目录或 `server/` 下创建 `.env`（不会提交，已在 .gitignore 中），并提供安全随机值。

可用示例（请勿在生产使用示例值）：
```
# server/.env
PORT=3000
JWT_SECRET=change_this_to_long_random_string
ENCRYPTION_KEY=another_long_random_string_for_aes
```
如果你希望前端在构建中访问变量，可使用 Vite 约定：`client/.env` 中以 `VITE_` 前缀命名。

### 3. 启动开发环境
在两个终端分别：
```bash
# 后端
cd server
npm start

# 前端
cd client
npm run dev
```
前端默认在 http://localhost:5173 ，后端在 http://localhost:3000

## 运行流程概览
1. 注册用户：POST /register
2. 登录：POST /login -> 得到 JWT
3. （可选）启用 2FA：
   - GET /2fa/setup -> 返回 otpauth_url + QR 二维码 DataURL
   - POST /2fa/verify 发送首次验证码确认
4. 管理卡片：
   - 列表：GET /cards (无需 2FA)
   - 查看详情：GET /cards/:id (需 2FA)
   - 新增：POST /cards (无需 2FA)
   - 修改：PUT /cards/:id (需 2FA)
   - 删除：DELETE /cards/:id (需 2FA)
5. 备份：POST /backup (需 2FA)

所有受保护接口需在 Header 加 `Authorization: Bearer <token>`。
需要 2FA 的接口再提供：
- `x-totp: <6位码>` 或在 JSON body / query 中 `totpCode`。

## 安全注意事项
- 不要把生产数据库 (`server/data/database.sqlite`) 或备份文件提交到仓库，已经通过 `.gitignore` 屏蔽。
- 一定使用强随机的 `JWT_SECRET` 与 `ENCRYPTION_KEY`，并存放在环境变量或秘密管理服务中。
- 当前代码用于示例，未实现：密码复杂度策略、速率限制、账户锁定、审计日志、多租户隔离、密钥轮换等。生产需补充。
- WebDAV 备份为明文 SQLite；如需更强安全性，可：
  1. 再次对整个文件进行对称加密后上传
  2. 或仅导出加密后的数据片段
- 浏览器端切勿缓存完整卡号；此示例中只有在详情查看时返回完整信息。

## 卡号识别及特殊规则
- CHINA T-UNION: 31 开头 19 位，固定显示银行 CHINA T-UNION，有效期强制 12/99
- eCNY: 0 开头 16 位，CVV 固定 000，有效期 12/99
- 其它受支持组织：使用 Luhn + 长度校验
- 未识别模式：允许 1-80 位纯数字（更自由的自定义/虚拟卡）

## 二因素认证重置流程
1. 用户提供旧验证码调用 POST /2fa/reset/init -> 生成临时新 secret (temp_totp_secret) 与二维码
2. 用户使用新秘钥生成验证码调用 POST /2fa/reset/confirm -> 替换正式 totp_secret

## 备份接口使用示例
```bash
curl -X POST http://localhost:3000/backup \
  -H "Authorization: Bearer <token>" \
  -H "x-totp: <code>" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-webdav.example/remote.php/dav/files/user/","username":"user","password":"pass","subdir":"card_backups"}'
```
返回示例：
```json
{"message":"Backup completed successfully","path":"card_backups/cardmanager_backup_20250101_101530.sqlite"}
```

## 构建生产前端
```bash
cd client
npm run build
# 生成文件位于 client/dist/
```
将 `client/dist` 部署到任意静态资源服务器（Nginx、CDN、静态托管等）。

## 常见问题 (FAQ)
Q: 数据库文件在哪？
A: `server/data/database.sqlite`（首次运行后生成）。

Q: 如何重置管理员密码？
A: 当前没有区分角色。可停止服务，删除数据库文件重新注册，或直接用 sqlite3 CLI 修改 `users` 表。

Q: 支持多用户隔离吗？
A: 是。`cards` 表 `user_id` 外键绑定，查询均按用户过滤。

## 未来可能的改进
- 速率限制 (express-rate-limit)
- 密码重置 / 邮件验证
- 更细粒度审计日志
- 多副本加密备份与恢复流程
- 支持硬件密钥 (WebAuthn)
- Docker 化部署

## 许可证
[GPL-3.0](LICENSE)
