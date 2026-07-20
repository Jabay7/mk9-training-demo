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

## Setup — about ten minutes, once

Do this in the Google account that should own the tracker and receive alerts.

1. Go to <https://script.google.com> and click **New project**.
2. Delete the placeholder `myFunction` code. Paste in all of
   `mk9-lead-tracker.gs`.
3. Click the gear (**Project Settings**) and tick
   **Show "appsscript.json" manifest file in editor**. Return to the editor,
   open `appsscript.json`, and replace it with the copy from this folder.
   This grants the script permission to touch Sheets, Calendar, and Gmail.
4. Rename the project to `MK9 Lead Tracker` so it is recognisable later.
5. In the function dropdown choose **setup**, then click **Run**.
   Google will ask for authorization. It warns that the app is not verified —
   expected for a private script. Choose **Advanced → Go to MK9 Lead Tracker
   (unsafe)** and allow.
   This creates the spreadsheet and the calendar, schedules the Monday digest,
   and emails you the links.
6. Click **Deploy → New deployment**. Choose type **Web app**, then set:
   - Description: `MK9 form endpoint`
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.
7. Send that URL to whoever maintains the website. It goes into
   `script.js` as `TRACKER_ENDPOINT`, and submissions start flowing.

### Sending alerts to a different address

By default alerts go to the account that authorized the script. To send them
elsewhere, open **Project Settings → Script Properties**, add a property named
`NOTIFY_EMAIL`, and set the address. The address is deliberately not stored in
the code, because the website repository is public.

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

Rows colour themselves: amber once a lead has gone a day without contact, red
after two, green once ticked off. The point is that a neglected lead becomes
visually obvious rather than scrolling out of sight.

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
