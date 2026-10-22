# WorkLink SA

A South African jobs marketplace connecting skilled workers with customers and businesses. Front-end build in plain HTML, CSS and JavaScript, with no build step.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Put it on GitHub

```bash
git init
git add .
git commit -m "WorkLink SA front-end"
git branch -M main
git remote add origin https://github.com/<you>/worklink-sa.git
git push -u origin main
```

To host it free, go to the repo's Settings → Pages and choose the `main` branch, root folder.

## What works

- Home, Find Jobs, Find Workers, Premium, FAQ, Contact, Terms, Privacy
- Sign up and log in as a worker or a customer
- Customers post jobs, review applicants, select a worker and mark a job completed
- Workers apply with their own price in Rands
- Reports, contact messages and Premium requests are recorded (Premium stays "pending payment confirmation")

## Important limits

All data is saved in each visitor's own browser (`localStorage`), so users cannot see each other's jobs and passwords are stored unencrypted. This is a demo front end. Before real launch, replace the `db` helper in `app.js` with a real backend (for example Supabase or Firebase) that provides authentication, a shared database, ID and selfie verification storage, an admin area and payment confirmation.

Terms and Privacy pages are placeholders and need real, legally reviewed text (including POPIA).

Settings such as the WhatsApp number are at the top of `app.js`.
