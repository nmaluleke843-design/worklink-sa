# WorkLink SA

A South African jobs marketplace connecting skilled workers with customers and businesses. Plain HTML, CSS and JavaScript front end with a Supabase backend (no build step).

## Setup

1. Create a Supabase project and run `schema.sql` in the SQL Editor.
2. Open `config.js` and paste your **publishable** key (starts with `sb_publishable_`). Never use the secret or service_role key in this project: the files are public on GitHub.
3. Open `index.html` locally, or serve the folder with `python3 -m http.server 8000`.

## Deploy

Push to GitHub and turn on Pages (Settings → Pages → `main` branch, root folder).

## What works

- Real sign up and log in for workers and customers
- Customers post jobs, review applicants, select a worker and mark the job completed
- Workers apply with their own price in Rands
- Jobs and workers are shared between all users
- Reports, contact messages and Premium requests are saved; Premium stays "pending payment confirmation"
- Row Level Security stops users granting themselves Verified, Premium or Featured status

## Before launch

- Switch "Confirm email" back on in Supabase (Authentication → Providers → Email)
- Replace the placeholder Terms and Privacy pages with legally reviewed text (POPIA)
- Verification, an admin area and payment confirmation are not built yet; review the `reports`, `contact_messages` and `subscriptions` tables in the Supabase dashboard
