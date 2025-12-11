# Seq3nce Desktop App

Electron desktop application for sales closers. Captures system audio during calls, streams to the audio processing service for real-time transcription and ammo extraction.

## Features

- **System Audio Capture**: Records both sides of Zoom/Meet calls via system audio loopback
- **Real-time Streaming**: Streams audio to the audio processing service via WebSocket
- **Status Indicator**: Visual feedback showing connection and recording status
- **Audio Level Meter**: Shows live audio levels during recording
- **System Tray**: App runs in background with tray menu for quick access
- **Cross-Platform**: Works on macOS and Windows

## Prerequisites

- Node.js 18+
- npm
- macOS: Screen Recording permission (for audio capture)
- Audio processing service running at `ws://localhost:8080`

## Installation

```bash
cd apps/desktop
npm install
```

## Development

Start the app in development mode:

```bash
npm start
```

This will:
1. Compile TypeScript
2. Bundle with Webpack
3. Launch Electron with hot reload

### Development Notes

- The app runs on port 3001 for the dev server (to avoid conflicts with Next.js on 3000)
- DevTools open automatically in development mode
- Console logs are available in DevTools for debugging

## Building for Production

### Package (without installer)

```bash
npm run package
```

This creates the app bundle in `out/` directory.

### Make Distributable

```bash
npm run make
```

This creates platform-specific installers:
- **macOS**: `.zip` in `out/make/zip/darwin/`
- **Windows**: `.exe` installer in `out/make/squirrel.windows/`
- **Linux**: `.deb` and `.rpm` packages

## Project Structure

```
apps/desktop/
├── src/
│   ├── index.ts          # Main process entry point
│   ├── preload.ts        # Preload script (IPC bridge)
│   ├── renderer.ts       # Renderer entry point
│   ├── index.html        # HTML template
│   ├── index.css         # Tailwind styles
│   └── renderer/
│       ├── App.tsx       # Main React component
│       ├── components/   # UI components
│       │   ├── StatusIndicator.tsx
│       │   ├── AudioLevelMeter.tsx
│       │   └── RecordButton.tsx
│       ├── hooks/        # React hooks
│       └── types/
│           └── electron.d.ts  # Type declarations
├── forge.config.ts       # Electron Forge configuration
├── webpack.*.ts          # Webpack configurations
├── tailwind.config.js    # Tailwind configuration
├── tsconfig.json         # TypeScript configuration
└── package.json
```

## How It Works

### Architecture

```
┌─────────────────────┐     ┌─────────────────────────┐
│   Renderer Process  │ IPC │     Main Process        │
│   (React UI)        │────▶│  - Audio capture        │
│                     │◀────│  - WebSocket connection │
│                     │     │  - System tray          │
└─────────────────────┘     └─────────────────────────┘
                                      │
                                      │ WebSocket
                                      ▼
                            ┌─────────────────────────┐
                            │  Audio Processing       │
                            │  Service                │
                            │  ws://localhost:8080    │
                            └─────────────────────────┘
```

### Audio Capture Flow

1. User clicks "Start Recording"
2. Main process requests screen recording permission (macOS)
3. `desktopCapturer` captures system audio (loopback)
4. Audio is streamed via WebSocket to the audio processing service
5. Service transcribes with Deepgram and extracts ammo with Claude
6. User clicks "Stop Recording" to end the session

## Testing

### Without the Audio Service

The app includes a simulation mode for testing the UI without the audio service:
1. Start the app
2. Click the record button
3. Watch simulated audio levels
4. Status indicator shows "Recording"

### With the Audio Service

1. Start the audio processing service:
   ```bash
   cd services/audio-processor
   npm run dev
   ```

2. Start the desktop app:
   ```bash
   cd apps/desktop
   npm start
   ```

3. Click "Start Recording"
4. Play audio on your computer (YouTube, Zoom call, etc.)
5. Watch the audio levels respond
6. Check the audio service logs for incoming data

## macOS Permissions

On macOS, the app requires **Screen Recording** permission to capture system audio.

When you first start recording:
1. A system prompt will appear asking for permission
2. Click "Open System Preferences"
3. Enable the checkbox for "Seq3nce" (or "Electron" in dev mode)
4. Restart the app

You can also grant permission manually:
1. Go to System Preferences → Security & Privacy → Privacy
2. Select "Screen Recording" in the left sidebar
3. Add and enable the app

## Environment Variables

Create a `.env` file (optional):

```env
# Audio processing service URL (defaults to ws://localhost:8080)
AUDIO_SERVICE_URL=ws://localhost:8080
```

## Troubleshooting

### "Screen recording permission not granted"
- Open System Preferences → Security & Privacy → Privacy → Screen Recording
- Enable permission for the app
- Restart the app

### App doesn't appear
- Check the system tray (menu bar on macOS, taskbar on Windows)
- The app minimizes to tray when closed

### No audio levels showing
- Verify screen recording permission is granted
- Make sure audio is playing on your system
- Check DevTools console for errors

### WebSocket connection fails
- Verify the audio processing service is running
- Check the service URL in the logs
- Ensure no firewall is blocking port 8080

## Next Steps

Future enhancements planned:
- [ ] Clerk authentication integration
- [ ] Calendar integration for scheduled calls
- [ ] Ammo tracker floating window
- [ ] Post-call outcome tagging
- [ ] Auto-updates
