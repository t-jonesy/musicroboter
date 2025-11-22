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
    video_info: jest.fn(),
    search: jest.fn(),
  },
}));

// Import after mocking
const playnextCommand = await import('../../src/commands/playnext.js');
const { musicQueue } = await import('../../src/utils/queue.js');
const { getVoiceConnection } = await import('@discordjs/voice');
const play = (await import('play-dl')).default;

describe('PlayNext Command', () => {
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
    expect(playnextCommand.data.name).toBe('playnext');
    expect(playnextCommand.data.description).toBe('Add a song to play next (top of queue)');
  });

  test('should reply if user is not in a voice channel', async () => {
    mockInteraction.member.voice.channel = null;
    mockInteraction.options.getString.mockReturnValue('test song');

    await playnextCommand.execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'You need to be in a voice channel to play music!'
    );
  });

  test('should add song to play next with playNext flag', async () => {
    const searchQuery = 'test song';
    const mockSearchResult = {
      title: 'Test Song',
      url: 'https://youtube.com/watch?v=test123',
      durationInSec: 180,
      thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
    };

    mockInteraction.options.getString.mockReturnValue(searchQuery);
    play.search.mockResolvedValue([mockSearchResult]);
    musicQueue.getQueueList.mockReturnValue([mockSearchResult, mockSearchResult]);

    await playnextCommand.execute(mockInteraction);

    expect(play.search).toHaveBeenCalled();
    // Verify that addSong was called with playNext = true
    expect(musicQueue.addSong).toHaveBeenCalledWith('guild-123', {
      title: mockSearchResult.title,
      url: mockSearchResult.url,
      duration: mockSearchResult.durationInSec,
      thumbnail: mockSearchResult.thumbnails[0].url,
      requestedBy: 'TestUser#1234',
    }, true, true);
  });

  test('should show correct position message', async () => {
    const mockSearchResult = {
      title: 'Test Song',
      url: 'https://youtube.com/watch?v=test123',
      durationInSec: 180,
      thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
    };

    mockInteraction.options.getString.mockReturnValue('test song');
    play.search.mockResolvedValue([mockSearchResult]);
    musicQueue.getQueueList.mockReturnValue([mockSearchResult, mockSearchResult]);

    await playnextCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'Added to play next: **Test Song** (Position: 1)'
    );
  });

  test('should handle YouTube URL', async () => {
    const youtubeUrl = 'https://www.youtube.com/watch?v=test123';
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
    musicQueue.getQueueList.mockReturnValue([mockVideoInfo.video_details, mockVideoInfo.video_details]);

    await playnextCommand.execute(mockInteraction);

    expect(play.video_info).toHaveBeenCalledWith(youtubeUrl);
    expect(musicQueue.addSong).toHaveBeenCalledWith('guild-123', expect.objectContaining({
      title: mockVideoInfo.video_details.title,
      url: youtubeUrl,
    }), true, true);
  });

  test('should handle Spotify URL', async () => {
    const spotifyUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgXcQ';
    const mockYouTubeResult = {
      title: 'Test Song',
      url: 'https://youtube.com/watch?v=test123',
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
          name: 'Test Song',
          artists: [{ name: 'Test Artist' }],
          id: '4cOdK2wGLETKBW3PvgXcQ',
        }),
      });

    mockInteraction.options.getString.mockReturnValue(spotifyUrl);
    play.search.mockResolvedValue([mockYouTubeResult]);
    musicQueue.getQueueList.mockReturnValue([mockYouTubeResult, mockYouTubeResult]);

    await playnextCommand.execute(mockInteraction);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(play.search).toHaveBeenCalled();
    expect(musicQueue.addSong).toHaveBeenCalledWith('guild-123', expect.objectContaining({
      title: mockYouTubeResult.title,
    }), true, true);
  });

  test('should handle errors gracefully', async () => {
    mockInteraction.options.getString.mockReturnValue('test song');
    play.search.mockRejectedValue(new Error('Network error'));

    await playnextCommand.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith(
      'An error occurred while trying to play the song!'
    );
  });
});
