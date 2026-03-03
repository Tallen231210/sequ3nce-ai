# Sequ3nce Desktop App - Troubleshooting

## Reset macOS Permissions

If permissions get messed up after re-downloading the app, run these commands in Terminal:

```bash
# Reset screen recording permission
tccutil reset ScreenCapture

# Reset microphone permission
tccutil reset Microphone
```

After running these commands:
1. Open the Sequ3nce app
2. Grant permissions when prompted (or manually in System Preferences → Privacy & Security)

## Common Issues

### App shows blank screen
- Try resetting permissions with commands above
- Delete the app and reinstall: `curl -sSL https://sequ3nce.ai/install.sh | bash`

### Keychain access prompt on launch
- Click "Deny" - the new email/password auth (v1.0.7+) doesn't use keychain

### Audio not capturing
- Ensure Screen Recording permission is granted (required for system audio on macOS)
- Check System Preferences → Privacy & Security → Screen Recording
