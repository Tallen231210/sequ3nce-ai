# Verify Closer Stats

Verify (or revoke verification of) a B2C closer's manually-entered profile stats after a pay stub review.

## Steps

1. **Find the closer** — Ask the user for the closer's name or email, then look them up:
```bash
npx convex data b2cUsers --prod --limit 100
```
Search the output for the matching user and grab their `_id`.

2. **Show their current profile** — Look up their profile to confirm stats:
```bash
npx convex data b2cProfiles --prod --limit 100
```
Find the profile matching their `userId` and show:
- Stats source (auto/manual/combined)
- Manual stats (if any)
- Current `isManuallyVerified` status

3. **Confirm with user** — Show the closer's name, stats, and ask: "Verify this closer's stats? (yes/no)"

4. **Run the verification** — Use curl to call the admin endpoint:
```bash
curl -X POST https://ideal-ram-982.convex.site/b2c/admin/verify-profile \
  -H "Content-Type: application/json" \
  -d '{"adminKey":"236f2998b81c8722de84efb316c286619cce8f746cf375b8d0fad3cbfa8337e1","userId":"USER_ID","isVerified":true}'
```

To **revoke** verification instead, set `"isVerified":false`.

5. **Confirm success** — Tell the user the closer's profile now shows "Verified by Sequ3nce" (or has been revoked).

## Arguments

The user may pass a name or email as an argument: $ARGUMENTS

If provided, skip step 1's question and search directly for that name/email.
