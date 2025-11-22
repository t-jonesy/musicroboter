# MusicRoboter

A Discord bot that plays music from Spotify (via YouTube) in voice channels with high-quality audio streaming.

## Features

- Play music from Spotify URLs (searches and streams from YouTube)
- Play music from YouTube URLs
- Search and play music by name
- Queue system with multiple songs
- **Disk caching** - Songs are cached to disk (default 10GB) for instant playback on subsequent plays
- **Smart preloading** - Next 2-3 songs in queue are preloaded to cache while current song plays for seamless transitions
- **Autoplay** - Automatically queue related songs when the queue is empty (user-requested songs take priority)
- Music controls: play, pause, resume, skip, stop, autoplay toggle
- View current queue and now playing information
- High-quality audio streaming optimized for Discord via yt-dlp
- Per-guild queue isolation - each Discord server has its own independent queue

## Commands

- `/play <query>` - Play a song from Spotify URL, YouTube URL, or search term
- `/playnext <query>` - Add a song to play next (front of queue)
- `/pause` - Pause the current song
- `/resume` - Resume the paused song
- `/skip` - Skip the current song
- `/stop` - Stop playing and clear the queue
- `/queue` - Show the current music queue (autoplay songs marked with 🎵)
- `/nowplaying` - Show information about the currently playing song
- `/autoplay` - Toggle autoplay on/off for related songs when queue is empty

## Prerequisites

- Node.js 18.0.0 or higher
- A Discord Bot Token
- Spotify API credentials (Client ID and Client Secret)
- FFmpeg installed on your system
- yt-dlp installed on your system

### Installing FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

### Installing yt-dlp

**macOS:**
```bash
brew install yt-dlp
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install yt-dlp
# Or using pip:
pip install yt-dlp
```

**Windows:**
Download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and add to PATH, or use pip:
```bash
pip install yt-dlp
```

## Setup

1. Clone this repository or download the files

2. Install dependencies:
```bash
npm install
```

3. Create a Discord Application:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Go to the "Bot" section and click "Add Bot"
   - Under "Privileged Gateway Intents", enable:
     - Server Members Intent
     - Message Content Intent
   - Copy the bot token

4. Get your Client ID:
   - In the Discord Developer Portal, go to "OAuth2" → "General"
   - Copy the "Client ID"

5. Get Spotify API Credentials:
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Log in with your Spotify account
   - Click "Create app"
   - Fill in the app name and description
   - Set Redirect URI to `http://localhost:3000` (not used but required)
   - Copy the Client ID and Client Secret

6. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

7. Edit `.env` and add your credentials:
```
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
```

8. Invite the bot to your server:
   - Go to OAuth2 → URL Generator in the Discord Developer Portal
   - Select scopes: `bot`, `applications.commands`
   - Select bot permissions:
     - Send Messages
     - Connect
     - Speak
     - Use Voice Activity
   - Copy the generated URL and open it in your browser
   - Select your server and authorize

## Running the Bot

Start the bot:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Usage

1. Join a voice channel in your Discord server
2. Use `/play <song name or URL>` to start playing music
3. The bot will join your voice channel and start playing
4. Use other commands to control playback

### Example Commands

```
/play Never Gonna Give You Up
/play https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT
/play https://www.youtube.com/watch?v=dQw4w9WgXcQ
/queue
/skip
/pause
/resume
/stop
```

## Architecture

### How It Works

- When you provide a Spotify URL, the bot:
  1. Extracts the track ID from the URL
  2. Fetches track metadata directly from Spotify's Web API using client credentials
  3. Searches YouTube for the song using track name and artist
  4. Streams the YouTube video audio
- YouTube URLs are streamed directly using `yt-dlp`
- Search queries are sent to YouTube to find the best match
- Audio is streamed at the best quality supported by your Discord server
- The queue system allows multiple songs to be queued up

### Caching System

MusicRoboter implements a sophisticated LRU (Least Recently Used) disk cache:

1. **First-time playback** - Songs are downloaded via `yt-dlp` and cached to `.cache/audio/`
2. **Cache hits** - Subsequent plays of the same song load instantly from disk
3. **Smart preloading** - The next 2-3 songs in queue are preloaded to cache in the background
4. **Automatic eviction** - When cache reaches the size limit (default 10GB), least recently used files are deleted
5. **Metadata tracking** - Cache tracks file size, last accessed time, and hit count
6. **Persistent** - Cache survives bot restarts for continued instant playback

This provides seamless transitions between songs and eliminates re-downloading.

### Autoplay System

When enabled, the autoplay feature keeps the music going automatically:

1. **User songs take priority** - If you add a song while autoplay is queued, autoplay songs are removed
2. **Smart song selection** - When the queue is empty, the bot searches for songs similar to what just played
3. **History tracking** - The bot tracks the last 50 songs to avoid repetition
4. **Automatic queueing** - Related songs are automatically added when the user queue is empty

Autoplay songs are clearly marked with a 🎵 icon in the queue display.

### Tech Stack

- **Discord.js v14** - Discord API integration with slash commands
- **@discordjs/voice** - Voice connection and audio streaming
- **play-dl** - YouTube and Spotify search/metadata
- **yt-dlp** - High-quality audio extraction (spawned as child process)
- **Jest** - Testing framework with ES module support

## Testing

The project includes comprehensive unit and integration tests.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Coverage

- **Command tests** - All slash commands (play, playnext, pause, resume, skip, stop, queue, nowplaying, autoplay)
- **Queue management tests** - Queue operations, player setup, connection handling
- **Caching tests** - Covered by queue tests (cache mocked for unit tests)
- **Autoplay tests** - Autoplay toggle, related song search, queue priority, history tracking
- **Integration tests** - Spotify API authentication and track fetching

Current test status: **76 passing unit tests, 1 passing integration test**

## Troubleshooting

**Bot doesn't join voice channel:**
- Make sure you're in a voice channel
- Check that the bot has "Connect" and "Speak" permissions

**No audio playing:**
- Ensure FFmpeg is installed and in your system PATH
- Ensure yt-dlp is installed and in your system PATH
- Check your voice channel region and try switching regions
- Check console logs for yt-dlp errors

**Commands not appearing:**
- Wait a few minutes for Discord to register the slash commands
- Try kicking and re-inviting the bot

**"An error occurred" messages:**
- Check the console for detailed error messages
- Ensure all dependencies are installed correctly
- Verify your `.env` file has valid tokens

**Gaps between songs:**
- The caching system should eliminate gaps automatically
- Check console logs for cache download errors
- Ensure yt-dlp is working correctly
- Cache is stored in `.cache/audio/` directory

**yt-dlp errors:**
- Update yt-dlp to the latest version: `pip install -U yt-dlp` or `brew upgrade yt-dlp`
- YouTube may occasionally block requests - this is usually temporary

## Project Structure

```
musicroboter/
├── src/
│   ├── index.js              # Main bot entry point
│   ├── config.js             # Environment configuration
│   ├── commands/             # Slash command implementations
│   │   ├── play.js           # Play music command
│   │   ├── playnext.js       # Add song to front of queue
│   │   ├── pause.js          # Pause playback
│   │   ├── resume.js         # Resume playback
│   │   ├── skip.js           # Skip current song
│   │   ├── stop.js           # Stop and clear queue
│   │   ├── queue.js          # Show queue
│   │   ├── nowplaying.js     # Show current song
│   │   └── autoplay.js       # Toggle autoplay
│   └── utils/
│       └── queue.js          # Queue management with preloading
├── __tests__/                # Test suite
│   ├── commands/             # Command tests
│   ├── utils/                # Utility tests
│   └── integration/          # Integration tests
├── .env                      # Environment variables (not in git)
├── .env.example              # Environment template
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## Dependencies

### Production Dependencies
- `discord.js` - Discord API wrapper for bot functionality
- `@discordjs/voice` - Voice connection and audio player handling
- `@discordjs/opus` - Opus audio codec for voice
- `@discordjs/ytdl-core` - Alternative YouTube downloader (fallback)
- `play-dl` - YouTube and Spotify search/metadata extraction
- `youtube-dl-exec` - yt-dlp wrapper for Node.js
- `libsodium-wrappers` - Audio encryption for voice
- `dotenv` - Environment variable management

### Development Dependencies
- `jest` - Testing framework
- `@jest/globals` - Jest global functions for ES modules

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please create an issue in the repository.

## Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Audio streaming powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Search functionality via [play-dl](https://github.com/play-dl/play-dl)
