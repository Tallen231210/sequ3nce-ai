# Sequ3nce Audio Processor

Real-time audio processing service that handles live call audio from the desktop app, transcribes it using Deepgram, extracts "ammo" (sales intelligence) using Claude, and saves everything to Convex.

## Architecture

```
Desktop App → WebSocket → Audio Processor → Deepgram (transcription)
                                         → Claude (ammo extraction)
                                         → Convex (database)
                                         → S3 (recording storage)
```

## Prerequisites

- Node.js 18+
- npm or yarn
- API keys for:
  - Deepgram (speech-to-text)
  - Anthropic (Claude API)
  - AWS S3 (recording storage)
- Convex deployment URL

## Installation

```bash
cd services/audio-processor
npm install
```

## Environment Variables

Create a `.env` file in this directory:

```env
# Deepgram API key for real-time transcription
DEEPGRAM_API_KEY=your_deepgram_api_key

# Anthropic API key for Claude ammo extraction
ANTHROPIC_API_KEY=your_anthropic_api_key

# AWS S3 credentials for recording storage
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=your_bucket_name
AWS_REGION=us-east-2

# Convex deployment URL (from your Convex dashboard)
CONVEX_URL=https://your-deployment.convex.cloud

# WebSocket server port
PORT=8080
```

## Running Locally

### Development mode (with hot reload)

```bash
npm run dev
```

### Production mode

```bash
npm run build
npm start
```

The WebSocket server will start on `ws://localhost:8080` (or your configured PORT).

## WebSocket Protocol

### Connection

Connect to the WebSocket server at `ws://localhost:8080`.

### Message Format

**First message (metadata):**
```json
{
  "type": "metadata",
  "teamId": "team_id_from_convex",
  "closerId": "closer_id_from_convex",
  "prospectName": "John Doe"
}
```

**Audio data:**
Send raw audio chunks as binary data (WebM/Opus format).

**End call:**
```json
{
  "type": "end_call"
}
```

### Server Events

The server sends events back to the client:

```json
{
  "type": "call_created",
  "callId": "convex_call_id"
}
```

```json
{
  "type": "transcript",
  "text": "Hello, how are you?",
  "speaker": 0,
  "isFinal": true
}
```

```json
{
  "type": "ammo",
  "ammo": {
    "type": "pain_point",
    "text": "Customer mentioned struggling with manual processes"
  }
}
```

```json
{
  "type": "status_change",
  "status": "on_call"
}
```

```json
{
  "type": "call_completed",
  "recordingUrl": "https://s3.amazonaws.com/..."
}
```

```json
{
  "type": "error",
  "message": "Error description"
}
```

## Testing Without the Desktop App

You can test the service using a simple Node.js script or wscat:

### Using wscat

```bash
# Install wscat
npm install -g wscat

# Connect to the server
wscat -c ws://localhost:8080

# Send metadata
{"type":"metadata","teamId":"your_team_id","closerId":"your_closer_id","prospectName":"Test Prospect"}
```

### Using a Test Script

Create a file `test-client.js`:

```javascript
import WebSocket from 'ws';
import fs from 'fs';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('Connected to audio processor');

  // Send metadata first
  ws.send(JSON.stringify({
    type: 'metadata',
    teamId: 'YOUR_TEAM_ID', // Get from Convex dashboard
    closerId: 'YOUR_CLOSER_ID', // Get from Convex dashboard
    prospectName: 'Test Prospect'
  }));

  // To test with real audio, read a WebM file and send chunks
  // const audioData = fs.readFileSync('test-audio.webm');
  // ws.send(audioData);

  // End the call after testing
  setTimeout(() => {
    ws.send(JSON.stringify({ type: 'end_call' }));
  }, 5000);
});

ws.on('message', (data) => {
  console.log('Received:', JSON.parse(data.toString()));
});

ws.on('close', () => {
  console.log('Disconnected');
});

ws.on('error', (err) => {
  console.error('Error:', err);
});
```

Run with: `node test-client.js`

## Ammo Types

The Claude integration extracts the following types of sales intelligence:

- **emotional**: Emotional statements revealing how the prospect feels
- **urgency**: Time-sensitive language or deadlines
- **budget**: Mentions of money, pricing, or financial constraints
- **commitment**: Buying signals or commitment indicators
- **objection_preview**: Early signs of potential objections
- **pain_point**: Problems or challenges the prospect is facing

## Call Status Flow

1. **waiting**: Call created, waiting for prospect to join (1 speaker detected)
2. **on_call**: Both parties present (2+ speakers detected)
3. **completed**: Call ended, recording uploaded

## Project Structure

```
services/audio-processor/
├── src/
│   ├── index.ts          # WebSocket server entry point
│   ├── call-handler.ts   # Call session management
│   ├── deepgram.ts       # Deepgram transcription integration
│   ├── claude.ts         # Claude ammo extraction
│   ├── convex.ts         # Convex database client
│   ├── s3.ts             # S3 upload functionality
│   ├── types.ts          # TypeScript type definitions
│   └── logger.ts         # Logging utility
├── package.json
├── tsconfig.json
├── .env
└── README.md
```

## Troubleshooting

### "Connection refused" error
Make sure the server is running (`npm run dev`) and you're connecting to the correct port.

### "Invalid API key" errors
Check that your `.env` file has the correct API keys and the file is in the `services/audio-processor` directory.

### No transcription appearing
- Verify your Deepgram API key has the correct permissions
- Check that you're sending valid audio data (WebM/Opus format)
- Look at the server logs for Deepgram connection errors

### S3 upload failing
- Verify your AWS credentials have S3 permissions
- Check that the bucket exists and is in the correct region
- Ensure the IAM user has `s3:PutObject` permission
