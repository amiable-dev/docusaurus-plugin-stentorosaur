# Notifications Setup

Send real-time alerts to Slack, Telegram, Email, or Discord when incidents occur or systems go down.

## Quick Start

**1. Create `.notifyrc.json` in your repository root:**

```json
{
  "enabled": true,
  "channels": {
    "slack": {
      "enabled": true,
      "webhookUrl": "env:SLACK_WEBHOOK_URL"
    }
  },
  "events": {
    "incidentOpened": true,
    "incidentClosed": true,
    "systemDegraded": true,
    "systemRestored": true
  }
}
```

**2. Add GitHub Secret:**

Settings → Secrets and variables → Actions → New repository secret:
- Name: `SLACK_WEBHOOK_URL`
- Value: Your Slack webhook URL

**3. Done!** Notifications send automatically via GitHub Actions workflows.

## Channel Setup

### Slack

Create webhook at https://api.slack.com/messaging/webhooks

```json
{
  "slack": {
    "enabled": true,
    "webhookUrl": "env:SLACK_WEBHOOK_URL",
    "channel": "#status-alerts",
    "mentionUsers": ["U123456"]
  }
}
```

**Secrets needed:** `SLACK_WEBHOOK_URL`

### Telegram

Create bot via @BotFather, get chat ID from `https://api.telegram.org/bot<TOKEN>/getUpdates`

```json
{
  "telegram": {
    "enabled": true,
    "botToken": "env:TELEGRAM_BOT_TOKEN",
    "chatId": "env:TELEGRAM_CHAT_ID"
  }
}
```

**Secrets needed:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

### Email (SMTP)

```json
{
  "email": {
    "enabled": true,
    "provider": "smtp",
    "from": "env:EMAIL_FROM",
    "to": ["env:EMAIL_TO"],
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "env:SMTP_USER",
        "pass": "env:SMTP_PASS"
      }
    }
  }
}
```

**Secrets needed:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_TO`

**Gmail:** Use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password.

### Discord

Create webhook: Channel → Edit → Integrations → Webhooks

```json
{
  "discord": {
    "enabled": true,
    "webhookUrl": "env:DISCORD_WEBHOOK_URL"
  }
}
```

**Secrets needed:** `DISCORD_WEBHOOK_URL`

## Event Types

```json
{
  "events": {
    "incidentOpened": true,       // New incident
    "incidentClosed": true,        // Incident resolved
    "incidentUpdated": false,      // Incident changed (can be noisy)
    "maintenanceScheduled": true,  // Maintenance announced
    "maintenanceStarted": true,    // Maintenance began
    "maintenanceCompleted": false, // Maintenance done
    "systemDegraded": true,        // Performance issues
    "systemRestored": true         // System recovered
  }
}
```

**Recommendation:** Disable `incidentUpdated` and `maintenanceCompleted` to reduce noise.

## Multiple Channels

Send to all channels simultaneously:

```json
{
  "enabled": true,
  "channels": {
    "slack": {
      "enabled": true,
      "webhookUrl": "env:SLACK_WEBHOOK_URL"
    },
    "telegram": {
      "enabled": true,
      "botToken": "env:TELEGRAM_BOT_TOKEN",
      "chatId": "env:TELEGRAM_CHAT_ID"
    },
    "email": {
      "enabled": true,
      "provider": "smtp",
      "from": "env:EMAIL_FROM",
      "to": ["env:EMAIL_TO"],
      "smtp": {
        "host": "env:SMTP_HOST",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "env:SMTP_USER",
          "pass": "env:SMTP_PASS"
        }
      }
    }
  }
}
```

## Testing

**Dry run (preview without sending):**
```bash
npx stentorosaur-notify --config .notifyrc.json --events events.json --dry-run
```

**Send test notification:**
```bash
# Create test event
cat > events.json << 'EOF'
{
  "type": "incident.opened",
  "timestamp": "2025-11-13T12:00:00Z",
  "incident": {
    "id": 1,
    "title": "Test Notification",
    "severity": "critical",
    "affectedEntities": ["api"],
    "url": "https://github.com/user/repo/issues/1",
    "body": "Testing notification system"
  }
}
EOF

# Send it
npx stentorosaur-notify --config .notifyrc.json --events events.json --verbose
```

## Troubleshooting

**No notifications received:**
1. Check `.notifyrc.json` exists in repository root
2. Verify secrets are set: Settings → Secrets and variables → Actions
3. Check workflow logs for "Send notifications" step
4. Ensure `enabled: true` for config and channel

**"Missing environment variable" error:**
- Secret not set in repository
- Check exact spelling (case-sensitive)
- Use `env:SECRET_NAME` syntax in config

**Slack "Invalid webhook URL":**
- Must start with `https://hooks.slack.com/`

**Telegram 403 Forbidden:**
- Bot not added to channel/group
- Invalid bot token

**Email authentication failed:**
- For Gmail: Use App Password, not regular password
- Verify SMTP host and port

## Security

- **Never commit secrets** - Use GitHub Secrets only
- **Use env: syntax** - Always reference secrets via `env:VAR_NAME`
- **Rotate regularly** - Update tokens/webhooks periodically
- See `.notifyrc.example.json` for complete example

## How It Works

1. **Workflows generate events** when incidents occur or systems change status
2. **CLI tool reads** `.notifyrc.json` and `events.json`
3. **Environment variables** are resolved (e.g., `env:SLACK_WEBHOOK_URL` → actual URL)
4. **Providers send** to all enabled channels
5. **Retries automatically** on temporary failures (3 attempts with exponential backoff)
6. **Non-blocking** - notification failures don't stop workflows
