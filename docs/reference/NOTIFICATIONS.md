# Notifications (v1)

**v1.0 has no built-in notifier.** The 0.x notification system
(email/Slack/Discord/Telegram/webhook providers + nodemailer) was
removed at the ADR-005 cutover — an honest capability cut, not a silent
regression (ADR-005 §11). The 0.x docs live in
[the archive](../archive/NOTIFICATIONS-0.x.md).

## What replaces it

### 1. The atom feed (published with the data)

Every data-branch write regenerates `status/v1/incidents.atom` with the
open + recent incidents. Point any feed consumer at it:

- **Slack**: `/feed subscribe https://<your-data-endpoint>/status/v1/incidents.atom`
- **Email**: any RSS-to-email bridge (e.g. Blogtrottr, Zapier email)
- **Automation**: Zapier / Make / n8n RSS triggers → anywhere

### 2. GitHub native notifications

Incidents ARE GitHub issues in your status repo — watchers of that repo
get issue notifications through their normal GitHub channels. Good for
the team; not for end-customers without GitHub accounts.

### 3. GitHub Actions hooks

`status-update-v1.yml` runs on every incident issue event — append your
own step (Slack webhook, PagerDuty, etc.) if you want push-style
alerting with your own credentials and templates.

## Future

Direct email/webhook notification is deferred to a potential separate
optional package — deliberately out of the plugin, so the render path
stays free of credential handling.
