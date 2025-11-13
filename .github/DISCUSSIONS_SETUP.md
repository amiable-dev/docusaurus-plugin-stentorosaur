# GitHub Discussions Setup Guide

This document describes the recommended GitHub Discussions configuration for the Stentorosaur repository.

## Overview

GitHub Discussions provides a community forum for questions, ideas, and conversations that don't fit into Issues or Pull Requests.

## Category Configuration

Configure the following categories in your repository settings:

**Path:** Settings → General → Features → Discussions → Edit categories

### 💬 General

- **Format:** Open-ended discussion
- **Description:** General discussion about Stentorosaur
- **Purpose:** Catch-all for conversations that don't fit other categories

**Use for:**
- General questions about the project
- Community announcements
- Feedback on the project direction
- Non-technical discussions

### 💡 Ideas

- **Format:** Open-ended discussion
- **Description:** Share ideas for new features or improvements
- **Purpose:** Community brainstorming before formal feature requests

**Use for:**
- Early-stage feature ideas
- Getting community feedback on proposals
- Discussing feasibility of features
- Collecting use cases before opening issues

**Note:** Ideas that get traction can be promoted to formal feature requests in Issues.

### 🙏 Q&A

- **Format:** Question/Answer
- **Description:** Ask questions about installation, configuration, and usage
- **Purpose:** Get help from the community and maintainers

**Use for:**
- "How do I...?" questions
- Troubleshooting setup issues
- Configuration questions
- Best practices discussions

**Features:**
- Supports marking answers as "Accepted"
- Questions can be marked as "Answered"

### 🎉 Show and Tell

- **Format:** Open-ended discussion
- **Description:** Share your Stentorosaur setups and use cases
- **Purpose:** Community showcases and inspiration

**Use for:**
- Sharing your status page setup
- Demonstrating custom configurations
- Case studies of interesting use cases
- Screenshots and demos
- Integration patterns

### 📣 Announcements

- **Format:** Announcement
- **Description:** Official announcements from maintainers
- **Purpose:** Important project updates

**Use for:**
- New release announcements
- Breaking change warnings
- Roadmap updates
- Security advisories

**Permissions:** Only maintainers can create posts; everyone can comment

## Pinned Discussions

Consider pinning these discussions:

1. **Welcome & Getting Started**
   - Quick links to documentation
   - How to get help
   - Code of Conduct reminder

2. **Roadmap & Feature Requests**
   - Link to project roadmap
   - How to request features
   - Voting on features

3. **Common Issues & Solutions**
   - FAQ-style discussion
   - Known issues and workarounds
   - Troubleshooting guide

## Discussion Labels

Apply labels to discussions for better organization:

### Topic Labels
- `topic:monitoring` - Health checks and uptime tracking
- `topic:incidents` - GitHub Issues integration
- `topic:notifications` - Slack, Telegram, Email, Discord
- `topic:charts` - Visualization and metrics
- `topic:configuration` - Setup and config
- `topic:performance` - Performance and optimization
- `topic:github-actions` - CI/CD and workflows

### Status Labels
- `answered` - Question has been answered (Q&A only)
- `needs-info` - Waiting for more information
- `good-first-issue` - Good for newcomers to explore

### Special Labels
- `upptime-related` - Questions about Upptime compatibility
- `migration` - Migrating from other tools
- `showcase` - Featured showcases (Show and Tell)

## Moderation Guidelines

### Response Time Goals
- Q&A: 1-2 business days
- Ideas: 1 week for initial feedback
- General: Best effort
- Announcements: N/A (maintainer-only)

### When to Lock Discussions
- Discussion has gone off-topic
- Code of Conduct violations
- Spam or abuse
- Discussion has been resolved and archived

### When to Convert to Issues
Convert discussions to issues when:
- Feature idea has clear consensus and spec
- Bug report is confirmed and reproducible
- Security concern is identified (convert to private security advisory)

## Community Guidelines

Remind participants to:

1. **Search first** - Check if your question has been answered
2. **Be specific** - Provide context, versions, and examples
3. **Be respectful** - Follow Code of Conduct
4. **Mark answers** - Help others by marking helpful answers (Q&A)
5. **Share back** - Post solutions when you figure things out

## Setting Up (For Maintainers)

### Step 1: Enable Discussions

1. Go to repository Settings
2. Scroll to "Features" section
3. Check "Discussions"

### Step 2: Create Categories

1. Click "Set up discussions"
2. GitHub creates default categories
3. Delete/modify defaults to match this guide
4. Create the 5 categories listed above

### Step 3: Pin Important Discussions

1. Create welcome/getting started discussion
2. Pin it to the top
3. Add quick links and resources

### Step 4: Add Labels

1. Create discussion labels as listed above
2. Apply them consistently

## Integration with Other Channels

### Link from Documentation
- Add "Discussions" link to README.md
- Reference in SUPPORT.md
- Include in CONTRIBUTING.md

### Link from Issues
- Add discussion link to issue templates
- Suggest discussing ideas before opening feature requests

### Link from Code of Conduct
- Reference discussions as primary community space

## Resources

- [GitHub Discussions Documentation](https://docs.github.com/en/discussions)
- [Best Practices for Discussions](https://docs.github.com/en/discussions/guides/best-practices-for-community-conversations-on-github)
- [Managing Discussions](https://docs.github.com/en/discussions/managing-discussions-for-your-community)

---

**Note:** This file is documentation only. Category configuration must be done through the GitHub web interface.
