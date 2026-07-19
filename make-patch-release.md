# SipWise — Patch Release Guide

This document outlines the complete procedure for releasing a **Patch Version** (e.g., `v0.1.22` ➔ `v0.1.23`) for SipWise.

---

## 📋 Pre-Release Checklist

Before performing any release, ensure all local quality gates pass:

```bash
# 1. Verify code formatting and lint rules (0 errors)
npm run lint

# 2. Run Vitest unit test suite (100% passing)
npm test -- --run

# 3. Verify production build compilation
npm run build
```

---

## 🗄️ Database & Environment Setup

If database migrations or schema updates were introduced:

1. Log in to **Supabase Dashboard** ➔ **SQL Editor**.
2. Run the SQL statements in **[update_db.sql](update_db.sql)** (or `supabase db push`).
3. Verify Edge Function Secrets in **Supabase Dashboard** ➔ **Edge Functions** ➔ **Secrets**:
   - `CRON_SECRET`
   - `VAPID_CONTACT_EMAIL`

---

## ✏️ Release File Updates

1. **Check Current Version:** Read version from `VERSION.txt` (e.g., `0.1.22`).
2. **Determine New Patch Version:** Increment patch number (e.g., `0.1.23`).
3. **Update Version Files:**
   - Change `VERSION.txt` to `0.1.23`.
   - Change `"version"` in `package.json` to `"0.1.23"`.
4. **Update Changelog:**
   - Open `CHANGELOG.md`.
   - Add a new section at the top:
     ```markdown
     ## [0.1.23] - YYYY-MM-DD
     ```
   - Copy unreleased notes from `unreleased.md` into this new section.
   - Reset `unreleased.md` to empty subheaders:
     ```markdown
     ### Added

     ### Changed

     ### Fixed

     ### Removed
     ```

---

## 🚀 PROCEDURE A: Local Terminal Deployment (0 GitHub Actions Minutes)

*Use this procedure when GitHub Actions minutes are depleted or when deploying directly from local terminal.*

### Step 1: Deploy Frontend to GitHub Pages (Local)
```bash
# Builds production assets and publishes directly to gh-pages branch
npm run deploy
```

### Step 2: Deploy Supabase Edge Functions (Local CLI)
```bash
# Log in to Supabase CLI (if needed)
npx supabase login

# Deploy Edge Functions directly to Supabase cloud
npx supabase functions deploy api --project-ref <YOUR_SUPABASE_PROJECT_ID> --no-verify-jwt
npx supabase functions deploy check-alerts --project-ref <YOUR_SUPABASE_PROJECT_ID> --no-verify-jwt
```

### Step 3: Git Commit, Push & GitHub Release
```bash
# Commit release changes on dev
git add VERSION.txt package.json CHANGELOG.md unreleased.md README.md
git commit -m "chore: release v0.1.23"
git push origin dev

# Merge dev into main
git checkout main
git pull origin main
git merge dev
git push origin main

# Return to dev branch
git checkout dev

# Create GitHub Release via gh CLI
gh release create v0.1.23 --title "v0.1.23" --notes-file CHANGELOG.md
```

---

## 🤖 PROCEDURE B: Automated GitHub Actions CI/CD Pipeline

*Use this procedure when GitHub Actions minutes are available.*

### Step 1: Commit & Push to Dev
```bash
# Commit release changes on dev
git add VERSION.txt package.json CHANGELOG.md unreleased.md README.md
git commit -m "chore: release v0.1.23"
git push origin dev
```

### Step 2: Pull Request & Merge to Main
1. Open a Pull Request from `dev` ➔ `main` on GitHub.
2. The `pr-preview.yml` workflow automatically runs lint, test, and build checks.
3. Merge the Pull Request into `main`.
4. The `deploy.yml` workflow automatically:
   - Builds production assets.
   - Deploys frontend to GitHub Pages (`gh-pages`).
   - Deploys Edge Functions to Supabase.
   - Runs post-deployment health check verification.

### Step 3: Create GitHub Release
```bash
# Pull latest main locally
git checkout main
git pull origin main

# Create GitHub Release via gh CLI
gh release create v0.1.23 --title "v0.1.23" --notes-file CHANGELOG.md

# Switch back to dev
git checkout dev
```
