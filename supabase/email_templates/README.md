# Supabase student OTP email

In the Supabase Dashboard, open **Authentication → Email Templates → Magic Link**. Set the subject to:

`Your MessMate verification code`

Paste the contents of `student-otp.html` into the template body and save. The `{{ .Token }}` variable renders the OTP; keep it in the template.

Then open **Authentication → Sign In / Providers → Email** and set **OTP length** to `6`. The website now accepts exactly six digits, so this hosted Auth setting must also be six. This repository template does not update hosted Supabase settings by itself.
