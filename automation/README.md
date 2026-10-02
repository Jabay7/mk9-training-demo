# MK9 lead tracker

Turns each contact-form submission into a row in a Google Sheet, a follow-up
reminder on a dedicated calendar, and an instant email alert. A digest lands
every Monday with the sheet attached and any neglected leads called out.

Runs on Google Apps Script. The data stays in the MK9 Google account.

## Setup

Do this in the Google account that should own the tracker.

1. Go to <https://script.google.com> and click **New project**.
2. Replace the placeholder code with all of `mk9-lead-tracker.gs`. Near the top,
   set the alert address:

   ```js
   var NOTIFY_EMAIL_ON_SETUP = 'someone@example.com';
   ```

   Leave it empty to send alerts to yourself. Whoever is named here also gets
   edit access to the sheet and the calendar.
3. In the function dropdown choose **setup**, then **Run**. Authorise when asked;
   the "app is not verified" warning is expected for a private script
   (**Advanced → Go to … (unsafe)**).

   This builds the spreadsheet and calendar, shares them, schedules the Monday
   digest, and emails out the links.
4. **Deploy → New deployment → Web app**, with **Execute as: Me** and
   **Who has access: Anyone**. Copy the **Web app URL** — it ends in `/exec`.
5. That URL goes into `script.js` as `TRACKER_ENDPOINT`, and its host must be
   allowed by the Content-Security-Policy in `index.html`.

`appsscript.json` is optional. Paste it in (**Project Settings → Show
"appsscript.json" manifest file in editor**) only to pin the timezone to Pacific
or to read the full scope list before authorising.

### Changing the alert address later

`NOTIFY_EMAIL_ON_SETUP` is read only while `setup()` runs. To redirect alerts
afterwards, open **Project Settings → Script Properties** and edit `NOTIFY_EMAIL`.
Sharing is not revisited, so grant the new address access to the sheet by hand if
it needs it. The address is never written into this repository.

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

Rows colour from the tick box: **red** while outstanding, **green** once ticked.
An untouched box counts as outstanding.

To change the colours, edit `applyConditionalFormatting_` and run
**`refreshFormatting`** — not `setup`, which would build a second spreadsheet and
calendar and start writing to the empty ones.

## Calendar

`setup()` creates a calendar called **MK9 Training**. Each lead gets a 15-minute
*Follow up: [name]* reminder 24 hours out, carrying their contact details and
notes about the dog, with a popup 10 minutes before.

Book real sessions on this calendar by hand. Automatic session blocks are
deliberately left out — most leads never convert, and tentative blocks for all of
them would bury the appointments that are real.

## Adjusting it

Everything tunable sits in the `CONFIG` block at the top of the script: follow-up
window, the day and hour of the digest, and how many days before a lead turns
amber or red. Edit, save, then **Deploy → Manage deployments → edit → New
version** for changes to reach the live endpoint.

## Health check

Open the `/exec` URL in a browser. A healthy deployment answers:

```json
{"status":"ok","configured":true,"calendar":true}
```

`configured: false` means `setup()` has not run in this project yet.
