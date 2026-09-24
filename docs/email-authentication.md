# Email authentication (SPF, DKIM, DMARC) for allindonesia-arrivalcard.com

Do this before the first order. Without it the QR delivery email lands in spam the night before a flight.

## 1. Resend domain (gives you DKIM and SPF)
1. resend.com → Domains → Add domain → `allindonesia-arrivalcard.com`, region: Asia-Pacific (Singapore) if offered.
2. Resend shows three DNS records. Add them at Cloudflare → DNS → Records, all **DNS only** (grey cloud):
   - **DKIM**: TXT, name `resend._domainkey`, value = the long `p=…` key Resend shows.
   - **SPF for the sending subdomain**: Resend uses a `send` subdomain by default: MX `send` → `feedback-smtp.<region>.amazonses.com` priority 10, and TXT `send` → `v=spf1 include:amazonses.com ~all`. Copy exactly what Resend shows; the region part differs.
3. Click Verify in Resend. Status must be "Verified" for all records.
4. Set `EMAIL_FROM="Arrival Card Assist <no-reply@allindonesia-arrivalcard.com>"` and `RESEND_API_KEY` in Vercel, redeploy.

## 2. SPF on the root domain
If nothing else sends mail from the root domain, add a TXT record on `@`:
```
v=spf1 include:amazonses.com -all
```
If you also use Google Workspace or another provider on this domain, merge the includes into one record:
```
v=spf1 include:_spf.google.com include:amazonses.com -all
```
There must be exactly one SPF TXT record on `@`.

## 3. DMARC
TXT record, name `_dmarc`, value:
```
v=DMARC1; p=quarantine; rua=mailto:info@allindonesia-arrivalcard.com; adkim=s; aspf=r; pct=100
```
Start with `p=quarantine`; move to `p=reject` after two weeks of clean reports. Create the `dmarc@` mailbox or forward it, otherwise the reports bounce.

## 4. Checks
- Send a test to a Gmail address, open the message → "Show original": SPF **PASS**, DKIM **PASS**, DMARC **PASS**.
- mail-tester.com: aim for 9/10 or better.
- Google Postmaster Tools: add the domain (free) to watch spam rate once volume grows.

## 5. Deliverability habits
- Send from `no-reply@` for automated mail but set Reply-To to the support mailbox (Resend: `reply_to`), so customers can answer.
- Keep the review-request and reminder emails plain, no images, one link each.
- Never send from a Gmail/Outlook address with the domain in the display name.
