# MK9 lead tracker and calendar

Turns every contact-form submission on trainwithmk9.com into a tracked lead:
a row in a Google Sheet, a follow-up reminder on a dedicated calendar, and an
instant email. A weekly digest lands every Monday morning with the sheet
attached as Excel and any neglected leads called out.

Everything runs on free Google Apps Script. The data lives in the MK9 Google
account — no third-party service holds client information.

## Why not just use the form service

The website posts to FormSubmit, whose free tier is email-only: no dashboard,
no webhooks, no API. Nothing can read submissions back out of it, so it cannot
feed a spreadsheet. This script replaces it as the primary destination.
FormSubmit stays wired up as a fallback, so if this script is ever down or
mid-redeploy the lead still arrives by email.

## Setup — about five minutes, once

Do this in the Google account that should own the tracker. It does not have to
be the account that works the leads; step 2 covers that.

1. Go to <https://script.google.com> and click **New project**.
2. Delete the placeholder `myFunction` code and paste in all of
   `mk9-lead-tracker.gs`. Near the top, set the alert address:

   ```js
   var NOTIFY_EMAIL_ON_SETUP = 'someone@example.com';
   ```

   Leave it empty to send alerts to yourself. Whoever is named here also gets
   edit access to the sheet and the calendar.
3. In the function dropdown choose **setup**, then click **Run**. Google asks
   for authorization and warns that the app is not verified — expected for a
   private script. Choose **Advanced → Go to Untitled project (unsafe)** and
   allow.

   This builds the spreadsheet and calendar, shares them, schedules the Monday
   digest, and emails out the links.
4. Click **Deploy → New deployment**, choose type **Web app**, then set
   **Execute as: Me** and **Who has access: Anyone**. Click **Deploy** and copy
   the **Web app URL** — it ends in `/exec`.
5. Send that URL to whoever maintains the website. It goes into `script.js` as
   `TRACKER_ENDPOINT`, and submissions start flowing.

`appsscript.json` in this folder is optional. Apps Script works out which
permissions it needs from the code itself. Paste it in (**Project Settings →
Show "appsscript.json" manifest file in editor**) only if you want to pin the
timezone to Pacific or read the full list of scopes before authorizing.

### Building it in one account for someone else to use

The tracker lives wherever `setup()` runs. Naming someone else in
`NOTIFY_EMAIL_ON_SETUP` gives them edit access to the sheet and calendar and
sends them every alert and digest, while the files stay in your Drive. The
setup confirmation goes to both of you.

### Changing the alert address later

`NOTIFY_EMAIL_ON_SETUP` is only read while `setup()` runs. To redirect alerts
afterwards, open **Project Settings → Script Properties** and edit the
`NOTIFY_EMAIL` value. Sharing is not revisited, so grant the new address access
to the sheet by hand if it needs it.

The address is never written into this repository, which is public.

## What the sheet tracks

| Column | Purpose |
|---|---|
| Date Received | Timestamp, filled automatically |
| Name / Email / Phone | Contact details from the form |
| Program | Day Program, Board & Train, or undecided |
| First Responder | Military, law enforcement, fire, EMS, medical |
| Comments | What they wrote about their dog |
| Source | `Website` for form submissions; type your own for phone or Instagram leads |
| Status | New, Contacted, Session Booked, Active Client, Not a Fit |
| Contacted | The tick box |
| Follow-Up Date | Defaults to 24 hours after arrival |
| Days Open | Counts itself |
| Notes | Yours |

Rows colour themselves from the tick box: **red** while a lead is outstanding,
**green** once it is ticked. An untouched box counts as outstanding, so a new
lead is red the moment it lands. The point is that anything still needing a call
is visible at a glance instead of scrolling out of sight.

To change the colours, edit `applyConditionalFormatting_` and then run
**`refreshFormatting`** — not `setup`, which would build a second spreadsheet and
calendar and start writing to the empty ones.

### Beyond what was asked for

Four columns were added on top of the requested ones, each for a reason:

- **Status** — a tick box alone cannot tell "left a voicemail" apart from
  "booked and paid", and that is the distinction that decides who to chase.
- **Follow-Up Date** and **Days Open** — leads go cold quickly, and the weekly
  digest uses these to name the ones that are slipping.
- **Source** — worth having in place before any Instagram or referral push, so
  there is a record of what actually brings clients in.
- **Notes** — somewhere for "nervous rescue, call after 6pm" to live.

## Calendar

`setup()` creates a calendar called **MK9 Training**. Each lead gets a 15-minute
*Follow up: [name]* reminder 24 hours out, carrying their contact details and
notes about the dog, with a popup 10 minutes before.

Book real sessions on this calendar by hand. Automatic session blocks were
deliberately left out — most leads never convert, and tentative blocks for all
of them would bury the appointments that are real.

## Adjusting it

Everything tunable sits in the `CONFIG` block at the top of the script:
follow-up window, the day and hour of the digest, and how many days pass before
a lead turns amber or red. Edit, save, then **Deploy → Manage deployments →
edit → New version** for changes to reach the live endpoint.

## Checking it is alive

Open the `/exec` URL in a browser. A healthy deployment answers:

```json
{"status":"ok","configured":true,"calendar":true}
```

`configured: false` means `setup()` has not run in this project yet.
