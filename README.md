# vault-example

This demo requires VAULT_APPROLE_ROLE_ID, and VAULT_APPROLE_SECRET_ID environment variables.

> If you do not have Vault AppRole credentials, request them from the Ops Team - from there make a User [Access Request](https://jira.i.mct360.com/servicedesk/customer/portal/2) (UAR) for resource "Other" and give them the details about what you need.

See it in action:

```bash
# QA1 - see .env file
VAULT_APPROLE_ROLE_ID=your_role_id VAULT_APPROLE_SECRET_ID=your_secret_id yarn start
```
