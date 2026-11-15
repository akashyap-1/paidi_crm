# PAIDI CRM test plan

About 25 minutes. Do sections 1 to 5 first; section 6 needs the Gmail setup from the README.

App: https://akashyap-1.github.io/paidi_crm/

## 1. Sign-in and the allowlist

| # | Step | Expected |
|---|---|---|
| 1.1 | Enter `someone-else@gmail.com`, send link | Same "Check your email" screen as a real user. No email arrives. |
| 1.2 | Enter your own allowlisted email, send link, open the link in the same browser | You land on Home, signed in. |
| 1.3 | Refresh the page on `#/pipeline` and on a company page | The page reloads in place. No 404. |
| 1.4 | Neel and Raphy each sign in (leave a few minutes between: about 2 sign-in emails per hour) | Both get in. Raphy's role shows "editor" in the bottom-left. |
| 1.5 | Sign out | Back to the sign-in screen. |

## 2. Roles

| # | Step | Expected |
|---|---|---|
| 2.1 | As Raphy, open a company | No "Delete company" control. Editing works. |
| 2.2 | As Raphy, open Settings | Gmail and automation settings are read-only. No Connect Gmail button. |
| 2.3 | As Raphy, open Review queue | Items are visible but cannot be approved or discarded. |
| 2.4 | As an admin, repeat 2.1 to 2.3 | Delete, settings and review actions are available. |

## 3. Prospects, pipeline, timeline

| # | Step | Expected |
|---|---|---|
| 3.1 | Add prospect: "Test Accounting LLC", industry Accounting, 45 employees, a hook, a contact | Suggested fit shows 5. The company opens, stage Researched. |
| 3.2 | Add the same company name again | The form warns it is already in the CRM. |
| 3.3 | Pipeline → Board: drag Test Accounting LLC to Contacted | Card moves, the depth strip counts update, a toast offers Undo. |
| 3.4 | Click Undo in the toast | Card returns to Researched. |
| 3.5 | Drag it to Lost | A panel asks for a reason; it cannot be saved empty. |
| 3.6 | Click a segment in the depth strip | Board and table show only that stage. Click again to clear. |
| 3.7 | Table view: filter by owner, industry, size, fit, last contacted; sort by a column | Rows filter and sort; counts in the strip follow the filters. |
| 3.8 | On the company page, Log a touch → Call, fill in the call intel fields | The call appears at the top of the timeline with its intel. |
| 3.9 | In the timeline, find a stage change marked Automatic (sample data has several) and press Undo on the latest one | Stage reverts; the change shows as Undone. |
| 3.10 | Mark a contact "Do not contact" | The contact is flagged; it stays in the database. |
| 3.11 | On a phone, tap Log in the bottom bar and log a call | Saves; the form is usable one-handed. |

## 4. Tasks and templates

| # | Step | Expected |
|---|---|---|
| 4.1 | Tasks → New task assigned to Raphy, due tomorrow, linked to a company | Appears under the right heading; shows on the company page. |
| 4.2 | Tick it done, then undo | Moves to Done and back. |
| 4.3 | Home | "Follow-ups due" lists overdue prospects you own; "My open tasks" lists yours. |
| 4.4 | Templates → New version of "Cold intro" | Version 3 is created; version 2 is retired unless you unticked that. |
| 4.5 | Log a touch using a template version | Dashboards → Templates counts it. |

## 5. Dashboards and import

| # | Step | Expected |
|---|---|---|
| 5.1 | Dashboards → Funnel, All time | Counts per stage, conversion between stages, weakest step highlighted. |
| 5.2 | Change the date range | Numbers change; the caption says which date is filtered. |
| 5.3 | Activity | Emails, calls and meetings per week for Advik, Neel and Raphy. |
| 5.4 | Templates | Reply rate and call rate per template version. |
| 5.5 | Segments | Response rate by industry, size and source. |
| 5.6 | Import → Companies: download the sample CSV, import it | Mapping is pre-matched; preview is correct; rows land in Researched. |
| 5.7 | Import the same file again | Every row is skipped as a duplicate. |
| 5.8 | Import → Call and touch logs with a sample file | Calls appear on the right company timelines. |

## 6. Gmail sync (after the README's Gmail setup)

| # | Step | Expected |
|---|---|---|
| 6.1 | Admin: Settings → Connect Gmail, approve read-only access | Back on Settings with the inbox listed as Active. |
| 6.2 | Send an email from your Gmail to a new address at a company domain, subject mentioning PAIDI. Settings → Sync now | A new company and contact exist, stage Contacted, with the email on the timeline and a working "Open in Gmail" link. |
| 6.3 | Sync now again | No duplicate timeline entries. |
| 6.4 | Send a second email to the same person, sync | Stage moves to Followed up (Automatic). |
| 6.5 | Have them reply (or reply from another account), sync | Stage moves to Responded; any open follow-up task for them is closed. |
| 6.6 | Check a clearly personal thread | It appears nowhere in the CRM. |
| 6.7 | Review queue: approve one item, discard another | Approved thread is logged on a timeline; discarded one disappears. |
| 6.8 | Settings → Backfill past email, 90 days | Earlier PAIDI threads appear over the next runs (about 20 threads per run, every 15 minutes). |
| 6.9 | Leave a Contacted prospect untouched for 3 days | A task "Follow up with … (call or email, not both)" appears for the sender. |
| 6.10 | Settings → Disconnect | Inbox shows Disconnected; no further syncing. |

## 7. Clean up

Settings → Sample data → Remove sample data, once you no longer need the fictional companies. Delete "Test Accounting LLC" from its company page (admin).
