# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.13.x  | :white_check_mark: |
| 0.12.x  | :white_check_mark: |
| 0.11.x  | :x:                |
| < 0.11  | :x:                |

We strongly recommend using the latest version to benefit from security updates.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to:

**[security@amiable.dev](mailto:security@amiable.dev)**

### What to Include

Please include as much of the following information as possible:

- **Type of vulnerability** (e.g., XSS, SQL injection, authentication bypass)
- **Full paths of source file(s)** related to the vulnerability
- **Location of the affected source code** (tag/branch/commit or direct URL)
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact of the vulnerability** - what can an attacker do?
- **Suggested fix** (if you have one)

### What to Expect

After you submit a report, you should expect:

1. **Acknowledgment** within 48 hours confirming we received your report
2. **Initial assessment** within 5 business days about severity and next steps
3. **Regular updates** on our progress (at least every 2 weeks)
4. **Credit** in the security advisory (unless you prefer to remain anonymous)

### Disclosure Policy

We follow **coordinated disclosure**:

1. We work with you to understand and validate the vulnerability
2. We develop and test a fix
3. We prepare a security advisory
4. We release the fix and publish the advisory
5. You may publish your own advisory after our fix is released

**Typical timeline:** 90 days from report to public disclosure

### Security Update Process

When we release a security update:

1. **Security advisory** published on GitHub
2. **CVE** assigned (if applicable)
3. **Patch release** with security fix
4. **Release notes** clearly mark security fixes
5. **npm advisory** if the vulnerability is in dependencies

## Security Best Practices

### For Users

**Token Security:**
- Never commit GitHub tokens to your repository
- Use GitHub Secrets for tokens in Actions workflows
- Rotate tokens periodically
- Use fine-grained Personal Access Tokens when possible

**Notification Security:**
- Use environment variables (`env:VAR_NAME`) for webhook URLs
- Never commit notification credentials
- Validate webhook payloads when possible
- Use secure SMTP connections (TLS/SSL)

**Content Security:**
- Markdown in incidents is sanitized with DOMPurify
- User-provided content is escaped to prevent XSS
- No `eval()` or unsafe JavaScript execution

### For Developers

**Code Review:**
- All PRs require review before merge
- Security-sensitive changes get extra scrutiny
- Automated security scanning via GitHub Advanced Security

**Dependencies:**
- Dependabot enabled for automated security updates
- Regular `npm audit` checks in CI
- Pin dependencies to specific versions

**Testing:**
- Never use real API tokens in tests
- Mock all external services
- Test input validation and sanitization

## Known Security Considerations

### GitHub API Rate Limits

Using a GitHub token in client-side code exposes it to users. **Never** pass your token to the browser.

**Safe:**
```javascript
// Server-side (Node.js, GitHub Actions)
const token = process.env.GITHUB_TOKEN;
```

**Unsafe:**
```javascript
// ❌ Client-side JavaScript
const token = "ghp_xxx"; // NEVER DO THIS
```

**Stentorosaur handles this correctly:**
- Token used only during build (server-side)
- Generated JSON is public (no tokens)
- Client-side components never see tokens

### Markdown Injection

User-provided markdown in GitHub issues is rendered on the status page.

**Protection:**
- All markdown is sanitized with [DOMPurify](https://github.com/cure53/DOMPurify)
- XSS attacks are prevented
- Malicious HTML is stripped
- Safe subset of HTML allowed

### Dependency Security

We use:
- **Dependabot** for automated dependency updates
- **npm audit** in CI pipeline
- **Snyk** scanning (optional)
- Regular manual reviews of dependencies

### GitHub Actions Security

Workflow security:
- Minimal permissions (`contents: write`, `issues: write` only when needed)
- No third-party actions without review
- Secrets never logged or exposed
- Workflow approval required for PRs from forks

## Security Hall of Fame

We thank the following people for responsibly disclosing security issues:

<!-- Future security researchers will be listed here -->

*None reported yet - be the first!*

## Contact

For security issues: [security@amiable.dev](mailto:security@amiable.dev)

For general support: See [SUPPORT.md](SUPPORT.md)

## Additional Resources

- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)
