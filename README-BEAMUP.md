# 🚀 Deploy Streailer to BeamUp

## Prerequisites

- Node.js installed
- GitHub account
- SSH key added to GitHub account

## Install BeamUp CLI 

```bash
npm install beamup-cli -g
```

## First Time Setup

```bash
beamup config
```

When prompted:
- **Host**: `a.baby-beamup.club`
- **GitHub username**: your-username

## Deploy

```bash
cd /path/to/streailer

# Initialize git (if not done)
git init
git add .
git commit -m "Initial commit"

# Deploy
beamup
```

Your addon will be available at:
```
https://YOUR-ID-streailer.baby-beamup.club/configure
```

## Update Existing Deploy (NO PUSH!)

```bash
git add .
git commit -m "Update"
beamup
```

Or:
```bash
git push beamup master
```

---

## 🔧 Troubleshooting

### Deploy Lock Error

If you see:
```
remote: ! App currently has a deploy lock in place
```

**Solution:**
```bash
ssh dokku@a.baby-beamup.club apps:unlock YOUR-APP-NAME
```

Example:
```bash
ssh dokku@a.baby-beamup.club apps:unlock 9aa032f52161-streailer
```

Then retry:
```bash
beamup
```

---

## 📋 Useful Commands

| Command | Description |
|---------|-------------|
| `beamup` | Deploy/update your app |
| `beamup config` | Reconfigure host/username |
| `git push beamup master` | Alternative push method |

### SSH Commands

```bash
# App info
ssh dokku@a.baby-beamup.club apps:info YOUR-APP-NAME

# View logs
ssh dokku@a.baby-beamup.club logs YOUR-APP-NAME

# Restart app
ssh dokku@a.baby-beamup.club ps:restart YOUR-APP-NAME

# Unlock deploy
ssh dokku@a.baby-beamup.club apps:unlock YOUR-APP-NAME

# Delete app
ssh dokku@a.baby-beamup.club apps:destroy YOUR-APP-NAME
```

---

## 📝 Notes

- Your project must use `process.env.PORT` for the HTTP port ✅
- Must have `package.json` with `start` script ✅
- Both requirements are already configured in Streailer
