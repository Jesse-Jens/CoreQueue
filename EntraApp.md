# Configuring a Microsoft Entra Application for CoreQueue

CoreQueue connects to Microsoft 365 via the Microsoft Graph API using the **client credentials** flow. This requires an application registration in Microsoft Entra ID with application permissions to read and send mail for the shared mailbox.

## 1. Create the App Registration
1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com) and open **Identity → Applications → App registrations**.
2. Click **New registration**.
   - Name: `CoreQueue`
   - Supported account types: **Accounts in this organizational directory only** (single tenant)
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
1. In the left menu, open **API permissions**.
2. Click **Add a permission → Microsoft Graph → Application permissions**.
3. Select the following permissions and then click **Add permissions**:
   - `Mail.ReadWrite`
   - `Mail.Send`
4. Click **Grant admin consent for <tenant>`** and confirm. The status column should show **Granted**.

> CoreQueue does not require delegated permissions or any of the `Mail.Read.Shared`/`Mail.ReadWrite.Shared` scopes. Only the two application permissions above are needed.

## 4. Allow Access to the Shared Mailbox
By default the app may read and send as **any** mailbox in the tenant. If you want to restrict it to the shared mailbox only, create an **Application Access Policy** in Exchange Online and add the mailbox to a security group referenced by that policy. Example PowerShell commands:

```powershell
# After running Connect-ExchangeOnline
New-ApplicationAccessPolicy -AppId <CLIENT_ID> -PolicyScopeGroupId <SECURITY_GROUP> -AccessRight RestrictAccess -Description "Allow CoreQueue to access shared mailbox"
Add-DistributionGroupMember -Identity <SECURITY_GROUP> -Member service@techfusion-it.com
```

You can also grant the app full access directly from the Exchange admin center under **Recipients → Mailboxes → (shared mailbox) → Mailbox delegation**.

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
SHARED_MAILBOX_UPN=shared@domain.com  # Address of the shared mailbox
GRAPH_API=https://graph.microsoft.com/v1.0
TOKEN_ENDPOINT=https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token
```

## 6. Troubleshooting
- `mail_access_denied` or "Access is denied. Check credentials and try again." usually indicates missing permissions or the mailbox not being included in your Application Access Policy.
- Ensure the client secret has not expired.
- Confirm the mailbox address is correct and the mailbox exists as a shared mailbox.
- Check server logs for the full Microsoft Graph error message when tests fail.

With these steps complete, CoreQueue will be able to fetch new messages from the shared mailbox every minute and send outgoing mail through the same address.
