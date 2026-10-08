# Facebook Account Creator

[English](README.md) | [简体中文](README.zh-CN.md)

Node.js and Puppeteer automation for a browser-based Facebook account-registration workflow. The script supports bounded runs, configurable browser/proxy settings, mailbox verification integrations, and optional Google Sheets output.

By default, the script runs in probe mode (`PROBE_ONLY=true`): it inspects the registration flow, records diagnostic artifacts, and stops before verification handling.

## Requirements

- Node.js 20 LTS or newer
- Chrome or Chromium
- A mailbox integration if the flow requires email verification

## Install

```sh
npm ci
```

The project reads configuration from process environment variables. `.env.example` is a reference template; the script does not load `.env` files automatically. Set the variables in your shell or through your process manager, and keep real credentials out of Git.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `ACCOUNT_PASSWORD` | Password assigned to generated accounts; required | unset |
| `EMAIL_DOMAINS` | Comma-separated mailbox domains, without `@` | `example.invalid` |
| `EMAIL_API_BASE` | Base URL for the HTTP mailbox API | unset |
| `EMAIL_API_KEY` | API key for the HTTP mailbox API | unset |
| `VMAIL_LOCAL` | Run the mailbox helper locally | `false` |
| `VMAIL_SSH_HOST` | SSH target for a remote mailbox helper | unset |
| `VMAIL_PYTHON_PATH` | Python executable used by the helper | `python` |
| `VMAIL_HELPER_PATH` | Path to the mailbox helper script | unset |
| `VMAIL_DOMAIN` | Domain passed to the mailbox helper | unset |
| `VMAIL_OTP_TIMEOUT` | Mailbox polling timeout in seconds | `180` |
| `HEADLESS` | Set to `false` to show the browser | `true` |
| `CHROME_PATH` | Chrome/Chromium executable path | Puppeteer's default |
| `PROBE_ONLY` | Stop after recording the registration-flow probe | `true` |
| `ENABLE_TOTP_2FA` | Enroll an authenticator-app TOTP secret after registration | `false` |
| `MAX_REGISTRATIONS` | Maximum attempts per process | `1` |
| `RESULTS_PATH` | JSONL output path | `results.jsonl` |
| `PROXY_HOST` / `PROXY_PORT` | Proxy endpoint | unset / `823` |
| `PROXY_USERNAME` / `PROXY_PASSWORD` | Proxy authentication | unset |
| `USE_GOOGLE_SHEETS` | Enable Google Sheets output | `false` |
| `GOOGLE_SPREADSHEET_ID` | Target spreadsheet ID | unset |
| `GOOGLE_SHEET_NAME` | Target sheet tab | `Sheet1` |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Path to the service-account JSON file | unset |

The HTTP mailbox integration expects `EMAIL_API_BASE` and `EMAIL_API_KEY`. Alternatively, the local or SSH helper must implement `create --domain <domain>` and `poll --domain <domain> --email <address> --mailbox-id=<id> --issued-after <timestamp> --timeout <seconds>`. It should print a JSON object containing `email` and `mailboxId` for creation, and `code` for polling.

## Run

Example for PowerShell:

```powershell
$env:ACCOUNT_PASSWORD = 'change-this-value'
$env:EMAIL_DOMAINS = 'mail.example.test'
$env:PROBE_ONLY = 'true'
$env:MAX_REGISTRATIONS = '1'
node .\register-loop.js
```

Example for macOS/Linux:

```sh
export ACCOUNT_PASSWORD='change-this-value'
export EMAIL_DOMAINS='mail.example.test'
export PROBE_ONLY=true
export MAX_REGISTRATIONS=1
node register-loop.js
```

Set `PROBE_ONLY=false` to continue past the probe stage. `run-vmail-batch.ps1` is a Windows convenience wrapper for SSH-backed mailbox helpers; pass `-Domain` and `-SshHost`, and set `VMAIL_HELPER_PATH` and `VMAIL_PYTHON_PATH` in the environment before invoking it.

## TOTP two-factor authentication

Set `ENABLE_TOTP_2FA=true` together with `PROBE_ONLY=false` to enroll an authenticator app after a successful registration. The script opens the two-factor setup flow, re-enters the account password, selects the authenticator-app method, extracts the Base32 secret, generates the first six-digit TOTP code, and confirms enrollment.

The JSONL result records `twoFactorEnabled`, `totpSecret`, `totpUri`, and `twoFactorError`. A new-device login can use a code generated from `totpSecret` instead of relying on an email code when the platform offers the configured 2FA method. Enrollment can still be blocked by an account checkpoint, and the platform may independently request email, device, or identity verification.

Generate the current six-digit code from a saved secret:

```powershell
$env:TOTP_SECRET = 'BASE32_SECRET_FROM_RESULTS'
npm run totp
```

```sh
TOTP_SECRET='BASE32_SECRET_FROM_RESULTS' npm run totp
```

## Output and data

The run appends JSON Lines to `RESULTS_PATH`. Successful results can include email addresses, passwords, account identifiers, session cookies, and TOTP secrets. Treat the output and diagnostic artifacts as secrets: store them locally with restricted access and do not commit or share them. `.gitignore` excludes common local result, session, capture, and credential files.

Run the syntax check with:

```sh
npm test
```

## Disclaimer

This project is provided "as is", without warranties of any kind. The authors are not affiliated with or endorsed by Meta or Facebook. Users are responsible for their use of this software and for complying with applicable terms and laws. To the maximum extent permitted by law, the authors and contributors are not liable for claims or damages arising from its use.
