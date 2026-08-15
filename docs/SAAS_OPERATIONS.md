# AltraMorph SaaS operations runbook

## Platform operations page

The Platform Control → **SaaS operations** page is the source of truth for readiness. Update an item only after its provider has been configured and tested. Every update is written to the platform audit log.

## Email and domains

- Configure Supabase Auth SMTP with a production provider such as Resend, Postmark, or Amazon SES.
- Create and verify SPF, DKIM, and DMARC records for the sending domain.
- Keep transactional templates branded, concise, and mobile friendly: invitation, password recovery, billing receipt, payment failure, maintenance, and support acknowledgement.
- Test every template against a real inbox before marking **Email templates** and **Sending domain** healthy.

## Backups and recovery

- Enable Supabase point-in-time recovery for production.
- Export a logical backup on a scheduled basis to encrypted, access-controlled storage.
- Perform a documented restore rehearsal at least quarterly.
- Record the backup provider, retention period, last restore test, and recovery owner in the Platform Operations item details.

## Monitoring and error tracking

- Use an uptime monitor against the deployed web app and the Supabase health/API endpoint.
- Configure alerts to a monitored support channel for downtime, elevated latency, and failed Paystack webhooks.
- Configure a client error tracker (for example Sentry) with separate development and production environments. Do not send customer names, phone numbers, payment references, or access tokens to the tracker.

## CI/CD

- The included GitHub Actions workflow runs a clean install and production build on every pull request and `main` push.
- Connect the repository to Vercel (or your chosen host) for preview deployments on pull requests and a production deployment after a successful `main` build.
- Keep Supabase migrations and Edge Function deployments as reviewed release steps. Apply migrations in order, deploy functions, then smoke-test login, checkout, billing webhook, and platform control.
- Store provider keys only in Vercel/Supabase/GitHub secrets—never in source control.

## Incident process

1. Publish a maintenance notice from Platform Control → **System status**.
2. Open a high-priority support ticket or incident record.
3. If tenant troubleshooting is required, start time-limited **Support & safety** access with a case reason. It expires automatically and is recorded in the platform audit log.
4. Resolve the notice only after verifying recovery and reviewing monitoring/error-tracking data.
