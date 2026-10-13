# Stores the Cloudflare API token and account id for this Windows user, so
# wrangler can deploy without the token ever being pasted into a chat or file.
# Run from the project folder:  npm run set-token
$secure = Read-Host -AsSecureString 'Paste the Cloudflare API token (nothing will show as you paste), then press Enter'
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$account = Read-Host 'Paste the Account ID (Workers & Pages page, right side, under Account details), then press Enter'
if (-not $token -or -not $account) { Write-Host 'Nothing saved: token or account id was empty.' -ForegroundColor Red; exit 1 }
[Environment]::SetEnvironmentVariable('CLOUDFLARE_API_TOKEN', $token.Trim(), 'User')
[Environment]::SetEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', $account.Trim(), 'User')
Write-Host 'Saved. You can close this tab and tell Claude "done".' -ForegroundColor Green
