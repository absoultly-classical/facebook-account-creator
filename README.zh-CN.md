# Facebook Account Creator

[English](README.md) | [简体中文](README.zh-CN.md)

这是一个基于 Node.js 和 Puppeteer 的浏览器自动化项目，用于 Facebook 账户注册流程。脚本支持限制单次运行数量、配置浏览器和代理、接入邮箱验证服务，以及可选的 Google Sheets 输出。

默认启用探测模式（`PROBE_ONLY=true`）：脚本会检查注册流程并保存诊断文件，在处理验证步骤前停止。

## 环境要求

- Node.js 20 LTS 或更高版本
- Chrome 或 Chromium
- 如果流程要求邮箱验证，需要配置邮箱接入方式

## 安装

```sh
npm ci
```

项目从进程环境变量读取配置。`.env.example` 仅供参考，脚本不会自动加载 `.env` 文件。请在 shell 或进程管理器中设置变量，并避免将真实凭据提交到 Git。

## 配置项

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `ACCOUNT_PASSWORD` | 生成账户使用的密码，必填 | 未设置 |
| `EMAIL_DOMAINS` | 逗号分隔的邮箱域名，不带 `@` | `example.invalid` |
| `EMAIL_API_BASE` | HTTP 邮箱 API 的基础 URL | 未设置 |
| `EMAIL_API_KEY` | HTTP 邮箱 API 密钥 | 未设置 |
| `VMAIL_LOCAL` | 在本机运行邮箱 helper | `false` |
| `VMAIL_SSH_HOST` | 远程邮箱 helper 的 SSH 目标 | 未设置 |
| `VMAIL_PYTHON_PATH` | helper 使用的 Python 可执行文件 | `python` |
| `VMAIL_HELPER_PATH` | 邮箱 helper 脚本路径 | 未设置 |
| `VMAIL_DOMAIN` | 传给邮箱 helper 的域名 | 未设置 |
| `VMAIL_OTP_TIMEOUT` | 邮箱轮询超时，单位为秒 | `180` |
| `HEADLESS` | 设为 `false` 以显示浏览器窗口 | `true` |
| `CHROME_PATH` | Chrome/Chromium 可执行文件路径 | Puppeteer 默认路径 |
| `PROBE_ONLY` | 记录注册流程探测结果后停止 | `true` |
| `ENABLE_TOTP_2FA` | 注册成功后开通身份验证器 TOTP | `false` |
| `MAX_REGISTRATIONS` | 每个进程的最大尝试次数 | `1` |
| `RESULTS_PATH` | JSONL 输出文件路径 | `results.jsonl` |
| `PROXY_HOST` / `PROXY_PORT` | 代理地址 | 未设置 / `823` |
| `PROXY_USERNAME` / `PROXY_PASSWORD` | 代理认证信息 | 未设置 |
| `USE_GOOGLE_SHEETS` | 启用 Google Sheets 输出 | `false` |
| `GOOGLE_SPREADSHEET_ID` | 目标电子表格 ID | 未设置 |
| `GOOGLE_SHEET_NAME` | 工作表标签页名称 | `Sheet1` |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Service Account JSON 文件路径 | 未设置 |

HTTP 邮箱接入需要同时配置 `EMAIL_API_BASE` 和 `EMAIL_API_KEY`。本地或 SSH helper 则需要实现以下命令：`create --domain <domain>` 和 `poll --domain <domain> --email <address> --mailbox-id=<id> --issued-after <timestamp> --timeout <seconds>`。创建命令应输出包含 `email` 和 `mailboxId` 的 JSON 对象，轮询命令应输出包含 `code` 的 JSON 对象。

## 运行

PowerShell 示例：

```powershell
$env:ACCOUNT_PASSWORD = 'change-this-value'
$env:EMAIL_DOMAINS = 'mail.example.test'
$env:PROBE_ONLY = 'true'
$env:MAX_REGISTRATIONS = '1'
node .\register-loop.js
```

macOS/Linux 示例：

```sh
export ACCOUNT_PASSWORD='change-this-value'
export EMAIL_DOMAINS='mail.example.test'
export PROBE_ONLY=true
export MAX_REGISTRATIONS=1
node register-loop.js
```

将 `PROBE_ONLY` 设为 `false` 可继续执行探测阶段之后的流程。`run-vmail-batch.ps1` 是供 Windows 使用的 SSH 邮箱 helper 启动脚本；调用时传入 `-Domain` 和 `-SshHost`，并在环境中设置 `VMAIL_HELPER_PATH` 与 `VMAIL_PYTHON_PATH`。

## TOTP 双重验证

同时设置 `ENABLE_TOTP_2FA=true` 和 `PROBE_ONLY=false`，可在注册成功后开通身份验证器。脚本会进入双重验证设置流程、重新输入账户密码、选择身份验证应用、提取 Base32 密钥、生成首个六位 TOTP 动态码并确认开通。

JSONL 结果会记录 `twoFactorEnabled`、`totpSecret`、`totpUri` 和 `twoFactorError`。在平台提供已配置的 2FA 方式时，新设备登录可使用由 `totpSecret` 生成的动态码，而无需依赖邮箱验证码。部分新账户会在开通过程中触发 checkpoint；平台也可能独立要求邮箱、设备或身份验证，因此 TOTP 不能保证完全取消其他验证。

使用已保存的密钥生成当前六位验证码：

```powershell
$env:TOTP_SECRET = 'RESULTS_中的_BASE32_密钥'
npm run totp
```

```sh
TOTP_SECRET='RESULTS_中的_BASE32_密钥' npm run totp
```

## 输出与数据

运行过程会向 `RESULTS_PATH` 追加 JSON Lines。成功结果可能包含邮箱地址、密码、账户标识符、会话 Cookie 和 TOTP 密钥。请将结果和诊断文件视为敏感数据，限制本地访问权限，不要提交或分享。`.gitignore` 已排除常见的本地结果、会话、抓取文件和凭据文件。

运行语法检查：

```sh
npm test
```

## 免责声明

本项目按“现状”提供，不附带任何形式的保证。作者与 Meta 或 Facebook 无隶属或背书关系。使用者应对软件的使用方式及其是否符合适用条款和法律自行负责。在法律允许的最大范围内，作者和贡献者不对因使用本项目而产生的索赔或损害承担责任。
