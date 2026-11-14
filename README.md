# MessMate

Responsive hostel mess portal built with Next.js, Supabase Auth and Supabase Postgres.

## Implemented in the application

- Student scholar-number login, email OTP onboarding/reset, full name capture, and password login.
- Separate restricted staff sign-in. The assigned profile role controls the portal: admin, convenor, warden, or legacy committee.
- Student mess feedback, private mess complaints, block/floor/room complaints, complaint IDs, a My Complaints page, and status updates.
- Staff portal with date/status filters, student names, break plans, feedback, complaints permitted for the signed-in role, and an admin-only approved-scholar list.
- Staff announcements with author name and role stamped from the signed-in account, shown on the public Updates page.
- Break plans saved in Supabase and available for staff review; the portal estimates today's expected eaters from active students minus declared absences.

## Database setup

The original schema is in `supabase/migrations/20261113000000_initial_schema.sql`. The first migration adds the warden role; the second adds profiles, announcements, floor complaints, staff permissions and complaint status rules. Apply them **in separate runs**, in this order, from the Supabase SQL Editor:

1. Run `supabase/migrations/20261113000001_add_warden_role.sql` and wait for success.
2. In a new SQL Editor query, run `supabase/migrations/20261113000002_staff_portals_and_complaints.sql`.

The warden role migration must commit before the next migration uses that new role.

## Create the Admin account

Only the Admin account is bootstrapped now. In Supabase **Authentication → Users → Add user**, create one user with the Admin's actual email and a strong password; mark the account confirmed. Open `supabase/bootstrap_admin_account.sql`, replace `admin@example.com` with that exact email in both places, and run the SQL. The SQL assigns the Admin role; it does not contain the password.

Admin signs in at `/staff/login` using that email and password. Convenor and Warden do not need separate staff emails now. First add/approve their scholar numbers and have them complete student onboarding. Then the Admin opens **Staff portal → Students** and changes their role to Convenor or Warden. They keep their scholar-number username and existing password and can use `/staff/login` afterward. Role assignment is limited to active, onboarded accounts; the Admin role cannot be assigned from the student list.

The admin sees the Students section and can approve/deactivate accounts and assign Convenor/Warden roles. Serious mess complaints are restricted to Admin/Committee and the submitting student; floor complaints, feedback and break plans are visible to active staff.

## Temporary demo sign-in without SMTP

For UI testing only, the app has a restricted demo-code mode. It does not send email and does not verify college email ownership. Use only fake scholar IDs `DEMO001`, `DEMO002`, and `DEMO003`, and test code `482731`. Insert those IDs in Supabase SQL Editor:

```sql
insert into public.scholar_allowlist (scholar_number, display_name, is_active)
values
  ('DEMO001', 'Demo Student 1', true),
  ('DEMO002', 'Demo Student 2', true),
  ('DEMO003', 'Demo Student 3', true)
on conflict (scholar_number) do update
set display_name = excluded.display_name, is_active = true;
```

Demo-code mode is selected by the server only for active scholar numbers listed in `MESSMATE_DEMO_SCHOLARS`. All other approved scholar numbers use college-email OTP, even when demo mode is enabled for those fake accounts. Keep the demo list limited to the fake IDs above. The demo variables are server-only; do not expose them through `NEXT_PUBLIC_` variables.

Real student onboarding and password recovery still require a working SMTP sender. Never use the demo mode for real scholar numbers.

## Run locally

From this folder, run:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. For production build verification, use `npm run build` (Webpack is selected for this Windows setup).

## Still to configure before live student use

- Apply both database migrations and create the single Admin account.
- Configure verified-domain SMTP before enabling real student email OTP.
- Add the real scholar-number allowlist through the admin portal.
- Assign Convenor and Warden roles to their active, onboarded scholar accounts when ready.
- Add automated email/in-app staff notifications if committee members need an alert immediately on complaint submission.
- Remove temporary demo sign-in variables before public production deployment.
