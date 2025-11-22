import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock modules
jest.unstable_mockModule('../../src/utils/queue.js', () => ({
  musicQueue: {
    getQueue: jest.fn(),
    createConnection: jest.fn(),
    setupPlayer: jest.fn(),
    addSong: jest.fn(),
    getQueueList: jest.fn(),
  },
}));

jest.unstable_mockModule('@discordjs/voice', () => ({
  getVoiceConnection: jest.fn(),
}));

jest.unstable_mockModule('play-dl', () => ({
  default: {
    spotify: jest.fn(),
    video_info: jest.fn(),
    search: jest.fn(),
  },
}));

// Import after mocking
const playCommand = await import('../../src/commands/play.js');
const { musicQueue } = await import('../../src/utils/queue.js');
const { getVoiceConnection } = await import('@discordjs/voice');
const play = (await import('play-dl')).default;

describe('Play Command', () => {
  let mockInteraction;
  let mockVoiceChannel;

  beforeEach(() => {
    jest.clearAllMocks();

    mockVoiceChannel = {
      id: 'voice-channel-123',
      guild: {
        id: 'guild-123',
        voiceAdapterCreator: jest.fn(),
      },
    };

    mockInteraction = {
      options: {
        getString: jest.fn(),
      },
      member: {
        voice: {
          channel: mockVoiceChannel,
        },
      },
      guildId: 'guild-123',
      user: {
        tag: 'TestUser#1234',
      },
      deferReply: jest.fn(),
      editReply: jest.fn(),
      reply: jest.fn(),
    };

    musicQueue.getQueueList.mockReturnValue([]);
    getVoiceConnection.mockReturnValue(null);
  });

  test('should have correct command data', () => {
    expect(playCommand.data.name).toBe('play');
    expect(playCommand.data.description).toBe('Play a song from Spotify or YouTube');
  });

  test('should reply if user is not in a voice channel', async () => {
    mockInteraction.member.voice.channel = null;
    mockInteraction.options.getString.mockReturnValue('test song');

    await playCommand.execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'You need to be in a voice channel to play music!'
    );
  });

  test('should handle YouTube search query', async () => {
    const searchQuery = 'never gonna give you up';
    const mockSearchResult = {
      title: 'Rick Astley - Never Gonna Give You Up',
      url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      durationInSec: 213,
      thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
    };

    mockInteraction.options.getString.mockReturnValue(searchQuery);
    play.search.mockResolvedValue([mockSearchResult]);
    musicQueue.getQueueList.mockReturnValue([mockSearchResult]);

    await playCommand.execute(mockInteraction);

    // Search may be called with "explicit" appended
    expect(play.search).toHaveBeenCalled();
    expect(musicQueue.addSong).toHaveBeenCalledWith('guild-123', {
      title: mockSearchResult.title,
      url: mockSearchResult.url,
      duration: mockSearchResult.durationInSec,
      thumbnail: mockSearchResult.thumbnails[0].url,
      requestedBy: 'TestUser#1234',
    });
  });

  test('should handle YouTube URL', async () => {
    const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const mockVideoInfo = {
      video_details: {
        title: 'Test Video',
        url: youtubeUrl,
        durationInSec: 180,
        thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
      },
    };

    mockInteraction.options.getString.mockReturnValue(youtubeUrl);
    play.video_info.mockResolvedValue(mockVideoInfo);
    musicQueue.getQueueList.mockReturnValue([mockVideoInfo.video_details]);

    await playCommand.execute(mockInteraction);

    expect(play.video_info).toHaveBeenCalledWith(youtubeUrl);
    expect(musicQueue.addSong).toHaveBeenCalled();
  });

  test('should handle Spotify URL and search YouTube', async () => {
    const spotifyUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
    const mockYouTubeResult = {
      title: 'Rick Astley - Never Gonna Give You Up',
      url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
      durationInSec: 213,
      thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
    };

    // Mock global fetch for Spotify API
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'test-token' }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          name: 'Never Gonna Give You Up',
          artists: [{ name: 'Rick Astley' }],
          id: '4cOdK2wGLETKBW3PvgPWqT',
        }),
      });

    mockInteraction.options.getString.mockReturnValue(spotifyUrl);
    play.search.mockResolvedValue([mockYouTubeResult]);
    musicQueue.getQueueList.mockReturnValue([mockYouTubeResult]);

    await playCommand.execute(mockInteraction);

    // Verify Spotify API was called
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Search should be called with track name and artist
    expect(play.search).toHaveBeenCalled();
    expect(musicQueue.addSong).toHaveBeenCalled();
  });

  test('should reject Spotify playlists', async () => {
    const spotifyPlaylistUrl = 'https://open.spotify.com/playlist/abc123';

    mockInteraction.options.getString.mockReturnValue(spotifyPlaylistUrl);

    await playCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'Invalid Spotify URL. Please use a track URL!'
    );
  });

  test('should handle no search results', async () => {
    mockInteraction.options.getString.mockReturnValue('some random query');
    play.search.mockResolvedValue([]);

    await playCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith('No results found!');
  });

  test('should create connection if one does not exist', async () => {
    const mockSearchResult = {
      title: 'Test Song',
      url: 'https://youtube.com/watch?v=test',
      durationInSec: 180,
      thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
    };

    mockInteraction.options.getString.mockReturnValue('test song');
    play.search.mockResolvedValue([mockSearchResult]);
    getVoiceConnection.mockReturnValue(null);
    musicQueue.getQueueList.mockReturnValue([mockSearchResult]);

    await playCommand.execute(mockInteraction);

    expect(musicQueue.createConnection).toHaveBeenCalledWith(mockVoiceChannel);
    expect(musicQueue.setupPlayer).toHaveBeenCalled();
  });

  test('should display correct message for first song in queue', async () => {
    const mockSearchResult = {
      title: 'Test Song',
      url: 'https://youtube.com/watch?v=test',
      durationInSec: 180,
      thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
    };

    mockInteraction.options.getString.mockReturnValue('test song');
    play.search.mockResolvedValue([mockSearchResult]);
    musicQueue.getQueueList.mockReturnValue([mockSearchResult]);

    await playCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'Now playing: **Test Song**'
    );
  });

  test('should display correct message for queued song', async () => {
    const mockSearchResult = {
      title: 'Test Song 2',
      url: 'https://youtube.com/watch?v=test2',
      durationInSec: 180,
      thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
    };

    mockInteraction.options.getString.mockReturnValue('test song 2');
    play.search.mockResolvedValue([mockSearchResult]);
    musicQueue.getQueueList.mockReturnValue([
      { title: 'Song 1' },
      mockSearchResult,
    ]);

    await playCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'Added to queue: **Test Song 2** (Position: 2)'
    );
  });

  test('should handle errors gracefully', async () => {
    mockInteraction.options.getString.mockReturnValue('test query');
    play.search.mockRejectedValue(new Error('Network error'));

    await playCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'An error occurred while trying to play the song!'
    );
  });
});
