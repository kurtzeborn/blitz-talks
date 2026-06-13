# Blitz Talks

A lightning talks submission and voting platform. Participants submit 5-minute talk topics and vote on the ones they want to hear. A gamekeeper manages sessions from a projected dashboard.

**Live at**: https://blitz.k61.dev

## How It Works

1. Gamekeeper creates a session and projects the QR code
2. Participants scan the QR code and sign in with Microsoft
3. Participants submit 1-3 talk topics and confirm their display name
4. Participants browse topics (no speaker names visible) and vote
5. Votes regenerate over time — return to the site to earn more
6. Gamekeeper picks speakers and marks talks as complete

## Development

See [docs/plan.md](docs/plan.md) for the full development plan.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: SWA Managed Functions (Node.js, TypeScript)
- **Database**: Azure Table Storage
- **Auth**: Microsoft Entra ID (all users — personal + work/school)
- **Hosting**: Azure Static Web Apps (Standard tier)
