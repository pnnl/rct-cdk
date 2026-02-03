# Getting Started

## Architecture

![Architecture Diagram](./assets/rct_webserver.drawio.png)

---

## Environment Variables

Create a `.env` file at the root of the project.

You can use `default.env` as a template:

```bash
cp default.env .env
```

Then fill in the required values for your environment.

---

## Configure Your AWS Profile

Set up an AWS CLI profile in `~/.aws/config`.

You can authenticate using **AWS SSO** *or* **access keys**.

### Option 1 — AWS SSO (Recommended)

```ini
[sso-session my-sso]
sso_start_url = https://your-org.awsapps.com/start
sso_region = us-west-2
sso_registration_scopes = sso:account:access

[profile my-project]
sso_session = my-sso
sso_account_id = <your-account-id>
sso_role_name = <your-role-name>
region = us-west-2
```

Log in:

```bash
aws sso login --sso-session my-sso
```

---

### Option 2 — Access Keys

```ini
[profile my-project]
aws_access_key_id = <your-access-key-id>
aws_secret_access_key = <your-secret-access-key>
region = us-west-2
output = json
```

---

## Useful CDK Commands

List all stacks:

```bash
npx cdk ls
```

Deploy all stacks:

```bash
npx cdk deploy --profile my-project --all
```

Deploy a single stack:

```bash
npx cdk deploy <stack-name> --profile my-project
```

If Docker build issues occur during deploy:

```bash
BUILDX_NO_DEFAULT_ATTESTATIONS=1 npx cdk deploy <stack-name> --profile my-project
```

See differences between deployed and local stack:

```bash
npx cdk diff --profile my-project
```

