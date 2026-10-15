# Finance Tracker

An **AI Partner Method** build. A clean, single-page personal finance dashboard:
upload your bank and card statements, see where the money goes, rate every
purchase, set budgets and keep an eye on what you own and owe.

Everything runs on free tiers. The whole front end is one `index.html` file, so
it is easy to read, host anywhere, and rebrand.

## What it does

- **Daily Recap:** everything new since your last upload, so you can rate each
  purchase (1 Want, 2 Could skip, 3 Need), fix categories with a tap and see bills
  due this week.
- **Overview:** the month's income, spending and net, with a month-over-month
  chart; what to set aside for taxes, giving and savings from last month's
  income; bills coming up; and a warning when a month is missing a statement.
- **Transactions:** every transaction, searchable, with spending by category or
  by need over time, notes on any transaction, and a picker that shows exactly
  the lines of one uploaded statement.
- **Budget:** budget vs actual for each category, worked out from your own
  averages.
- **Insights:** a month-by-month review: how you did, where to improve and a plan
  for next month.
- **Accounts:** each bank account and card, the balances you enter, what you owe
  and your net worth over time.
- **Imports:** bank CSV downloads (including RBC's format), plus PDF statements
  read by AI (optional). Transactions you already have are skipped.
- **Safe on every device:** each user signs in and their data syncs privately to
  their own account. A phone and a computer used at the same time never wipe each
  other's changes.
- **Optional extras:** one login can look after a family member's account, and
  you can turn on "Continue with Google".

The app works fully **without** the AI features. They are an optional add-on you
can switch on later.

---

## What you need

- A free [Supabase](https://supabase.com) account (database + login). Required.
- A static host to put the app online (Netlify, Vercel, GitHub Pages, or any web
  host). Required for sharing; optional for testing on your own machine.
- For the optional AI features only: a free [Groq](https://console.groq.com) API
  key and a free [Netlify](https://netlify.com) account.

No build step, no `npm install` for the app itself. It is plain HTML, CSS, and
JavaScript.

---

## Part 1: Core setup (required, about 10 minutes)

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com), create a new project, and wait for it
to finish provisioning.

### 2. Create the database tables
In the Supabase dashboard open **SQL Editor > New query**, paste the entire
contents of [`schema.sql`](schema.sql), and click **Run**. This creates the tables
and turns on Row Level Security so each person can only ever see their own data.
Running it again later is safe.

### 3. Get your keys
In the Supabase dashboard go to **Project Settings > API** and copy:
- **Project URL** (looks like `https://abcdefgh.supabase.co`)
- **anon public** key (a long string)

### 4. Fill in `config.js`
Open [`config.js`](config.js) and paste those two values in:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "paste-your-anon-key-here",
  AI_URL: "",            // leave blank for now
  GOOGLE_SIGN_IN: false  // see Part 3
};
```

The anon key is meant to be public and shipped in the browser. Your data is safe
because the Row Level Security rules from step 2 only let a signed-in user read
their own rows.

### 5. Configure login emails (recommended)
By default Supabase asks new users to confirm their email, but its built-in email
delivery is unreliable for real use. Two options:
- **Simplest for a personal app:** in **Authentication > Providers > Email**, turn
  **Confirm email** off, so signup logs you straight in.
- **For real users:** leave it on and connect your own SMTP provider under
  **Authentication > Emails**.

### 6. Run it
Put `index.html`, `config.js`, and the folder online with any static host, or open
`index.html` locally to test. Create an account, sign in, and upload a bank CSV
download or add transactions by hand. Reload the page or open it on another
device: your data follows you.

Deploying is just uploading the files. On Netlify or Vercel, drag the project
folder in or connect this repo; there is no build command and the publish
directory is the project root.

---

## Part 2: AI features (optional)

This turns on PDF statement reading and the chat assistant. It adds a small
serverless function so your AI key stays on the server and is never exposed in the
browser. Only signed-in users of your Supabase project can call it.

### 1. Get a Groq API key
Create one free at [console.groq.com](https://console.groq.com) under **API Keys**.

### 2. Deploy the backend
The [`ai-backend/`](ai-backend) folder is a ready-to-deploy Netlify site with one
function. Create a new Netlify site from it (drag the folder into Netlify, or
connect the repo and set the base directory to `ai-backend`).

### 3. Set the environment variables
In that Netlify site: **Site settings > Environment variables**. Add the three
values from [`ai-backend/.env.example`](ai-backend/.env.example):
- `GROQ_API_KEY`: your Groq key
- `SUPABASE_URL`: the same URL from Part 1
- `SUPABASE_ANON_KEY`: the same anon key from Part 1

Redeploy the site so the variables take effect.

### 4. Point the app at it
Your function URL will look like
`https://your-site-name.netlify.app/.netlify/functions/ai`. Put it in `config.js`:

```js
AI_URL: "https://your-site-name.netlify.app/.netlify/functions/ai"
```

Reload the app. The **Upload statement** button now accepts PDFs and a chat bubble
appears once you are signed in.

Statements are read one at a time. Groq's free tier allows a limited amount per
minute, so a big batch takes a few minutes; the app shows how long is left and
waits for the limit by itself. Keep the tab open until it finishes.

---

## Part 3: Optional extras

### Continue with Google
1. In Supabase: **Authentication > Providers > Google**. Turn it on and paste a
   Google OAuth client ID and secret (that screen links to Supabase's guide for
   creating them).
2. In **Authentication > URL Configuration**, add your app's address to
   **Redirect URLs**, for example `https://your-site.netlify.app/**`.
3. In `config.js`, set `GOOGLE_SIGN_IN: true`.

### Manage a family member's account
One login can open and edit someone else's finances, for example a parent's. Both
people need their own account first (each signs up once). Then, in the Supabase
**SQL Editor**, run this with your two email addresses:

```sql
insert into public.finance_managers (manager_id, member_id, label)
select manager.id, member.id, 'Mum'
from auth.users manager, auth.users member
where lower(manager.email) = lower('you@example.com')
  and lower(member.email) = lower('mum@example.com');
```

`label` is the name shown in the picker. Sign in as the manager and a picker
appears in the header with each person you manage, then your own account. The
person you manage still signs in as normal and only ever sees their own data. To
undo it, delete that row from `finance_managers`.

---

## How it works

A good small example of a real cloud app:

- **Front end:** one `index.html` file. Vanilla JS, Chart.js for graphs, pdf.js to
  read PDF text in the browser. Configuration is isolated in `config.js`.
- **Auth + database:** Supabase. Email/password login (Google optional); each
  user's transactions and settings are stored as JSON in a single row keyed to
  their user id. Row Level Security (`schema.sql`) enforces that a user can only
  touch their own row, or the rows of people they manage, which is why the public
  anon key is safe to ship.
- **Saving:** every save only goes through if nobody else saved that row since
  this page last loaded it. If another device did, the app fetches the newest
  version, applies its own changes on top and saves again.
- **AI proxy:** a Netlify serverless function (`ai-backend/`). The browser never
  sees the AI key; it calls the function with the user's login token, the function
  verifies that token against Supabase, then calls the AI provider. This is the
  pattern to copy any time you need to use a paid API key from a web app.

---

## Security notes

- The Supabase **anon key is public by design.** It is safe in `config.js` because
  RLS protects the data. Never put your Supabase **service_role** key or your Groq
  key in `config.js` or any browser file.
- The Groq key lives only in the Netlify function's environment variables, never in
  the repo. `.env` is gitignored; `.env.example` is the template.
- Each user's data is isolated to their own account by RLS. Who manages whom can
  only be set in the SQL Editor, never from the app.

---

## Make it yours

- App name and colors: search `index.html` for the title text and the colors in
  the "AI Partner Method look" block at the end of the `<style>` section.
- Categories and default budgets: near the top of the main `<script>` in
  `index.html` (`DEFAULT_CATS`, `DEFAULT_BUDGETS`).

---

## License

Released under the [MIT License](LICENSE). You are free to use, modify, and build
on it for your own projects.
