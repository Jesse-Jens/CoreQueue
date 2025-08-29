# Configuring a Microsoft Entra Application for CoreQueue

CoreQueue connects to Microsoft 365 via the Microsoft Graph API using the **client credentials** flow. This requires an application registration in Azure AD (Microsoft Entra ID) with application permissions to read and send mail for the shared mailbox.

## 1. Create the App Registration
1. Sign in to the [Azure Portal](https://portal.azure.com) and open **Azure Active Directory → App registrations**.
2. Click **New registration**.
   - Name: `CoreQueue`
   - Supported account types: **Single tenant** (default is fine)
   - Redirect URI: *Leave blank* – CoreQueue does not use OAuth redirects.
3. After creation, note the following values from the app's **Overview** page:
   - **Directory (tenant) ID**
   - **Application (client) ID**

## 2. Create a Client Secret
1. In the app registration, open **Certificates & secrets**.
2. Under **Client secrets**, click **New client secret**.
3. Give the secret a description (e.g. `CoreQueue`) and choose an expiration period.
4. Click **Add** and copy the secret **Value**. You will not be able to view it again.

## 3. Grant Microsoft Graph Permissions
1. Still inside the app registration, open **API permissions**.
2. Click **Add a permission → Microsoft Graph → Application permissions**.
3. Select the following permissions and then click **Add permissions**:
   - `Mail.ReadWrite`
   - `Mail.Send`
4. Click **Grant admin consent** and confirm. The status column should show **Granted**.

> CoreQueue does not require delegated permissions or any of the `Mail.Read.Shared`/`Mail.ReadWrite.Shared` scopes. Only the two application permissions above are needed.

## 4. Allow Access to the Shared Mailbox
By default, an app with the permissions above can access every mailbox. If your tenant uses **Application Access Policies** to restrict mailbox access, ensure the shared mailbox is allowed.

Example PowerShell commands (Exchange Online):

```powershell
# Connect-ExchangeOnline first
New-ApplicationAccessPolicy -AppId <CLIENT_ID> -PolicyScopeGroupId <SECURITY_GROUP> -AccessRight RestrictAccess -Description "Allow CoreQueue to access shared mailbox"
# Add the shared mailbox to the security group referenced above
Add-DistributionGroupMember -Identity <SECURITY_GROUP> -Member service@techfusion-it.com
```

Alternatively, assign the app full access to the mailbox through the Exchange admin center.

## 5. Configure CoreQueue
1. In CoreQueue, open **Settings → System** (admin only).
2. Enter the mailbox address (`service@techfusion-it.com` or your own), Tenant ID, Client ID and Client Secret.
3. Click **Save**.
4. Use **Send Test Mail** to verify the configuration. The server sends a message from the shared mailbox back to itself and reports the result.

### Environment variables

Instead of using the settings page you may configure the mailbox via environment variables (e.g. in a `.env` file). CoreQueue recognises the following variables:

```
TENANT_ID=...                    # Azure/Entra tenant GUID
CLIENT_ID=...
CLIENT_SECRET=...
SHARED_MAILBOX_UPN=shared@domain.com
WEBHOOK_PUBLIC_URL=https://<your-app>/graph/webhook
GRAPH_API=https://graph.microsoft.com/v1.0
TOKEN_ENDPOINT=https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token
```

## 6. Troubleshooting
- `mail_access_denied` or "Access is denied. Check credentials and try again." usually indicates missing permissions or the mailbox not being included in your Application Access Policy.
- Ensure the client secret has not expired.
- Confirm the mailbox address is correct and the mailbox exists as a shared mailbox.
- Check server logs for the full Microsoft Graph error message when tests fail.

With these steps complete, CoreQueue will be able to fetch new messages from the shared mailbox every minute and send outgoing mail through the same address.
