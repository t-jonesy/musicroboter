import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the @discordjs/voice module
const mockCreateAudioPlayer = jest.fn();
const mockCreateAudioResource = jest.fn();
const mockJoinVoiceChannel = jest.fn();
const mockPlay = jest.fn();
const mockStop = jest.fn();
const mockPause = jest.fn();
const mockUnpause = jest.fn();
const mockDestroy = jest.fn();
const mockSubscribe = jest.fn();

const AudioPlayerStatus = { Idle: 'idle', Playing: 'playing' };
const VoiceConnectionStatus = { Ready: 'ready' };
const StreamType = { Arbitrary: 'arbitrary' };

jest.unstable_mockModule('@discordjs/voice', () => ({
  createAudioPlayer: mockCreateAudioPlayer,
  createAudioResource: mockCreateAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  joinVoiceChannel: mockJoinVoiceChannel,
}));

// Mock child_process
const mockSpawn = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock play-dl
jest.unstable_mockModule('play-dl', () => ({
  default: {
    stream: jest.fn(),
  },
}));

// Mock audio cache
const mockCacheDownload = jest.fn();
const mockCachePreload = jest.fn();
jest.unstable_mockModule('../../src/utils/cache.js', () => ({
  audioCache: {
    initialize: jest.fn().mockResolvedValue(undefined),
    download: mockCacheDownload,
    preload: mockCachePreload,
  },
}));

// Import after mocking
const { MusicQueue } = await import('../../src/utils/queue.js');

describe('MusicQueue', () => {
  let queue;
  let mockPlayer;
  let mockConnection;
  const testGuildId = 'test-guild-123';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock player
    mockPlayer = {
      play: mockPlay,
      stop: mockStop,
      pause: mockPause,
      unpause: mockUnpause,
      once: jest.fn(),
    };

    // Setup mock connection
    mockConnection = {
      subscribe: mockSubscribe,
      destroy: mockDestroy,
    };

    mockCreateAudioPlayer.mockReturnValue(mockPlayer);
    mockJoinVoiceChannel.mockReturnValue(mockConnection);

    // Setup mock cache download to return a stream
    const mockStream = {
      on: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
    };
    mockCacheDownload.mockResolvedValue(mockStream);
    mockCachePreload.mockResolvedValue(true);

    // Create a new queue instance
    queue = new MusicQueue();
  });

  describe('getQueue', () => {
    test('should create a new queue for a guild if one does not exist', () => {
      const guildQueue = queue.getQueue(testGuildId);

      expect(guildQueue).toBeDefined();
      expect(guildQueue.songs).toEqual([]);
      expect(guildQueue.connection).toBeNull();
      expect(guildQueue.player).toBeNull();
      expect(guildQueue.isPlaying).toBe(false);
      expect(guildQueue.currentSong).toBeNull();
    });

    test('should return existing queue for a guild', () => {
      const firstQueue = queue.getQueue(testGuildId);
      firstQueue.isPlaying = true;

      const secondQueue = queue.getQueue(testGuildId);

      expect(secondQueue).toBe(firstQueue);
      expect(secondQueue.isPlaying).toBe(true);
    });
  });

  describe('setupPlayer', () => {
    test('should create and setup a new player', () => {
      const player = queue.setupPlayer(testGuildId, mockConnection);

      expect(mockCreateAudioPlayer).toHaveBeenCalled();
      expect(mockConnection.subscribe).toHaveBeenCalledWith(mockPlayer);
      expect(player).toBe(mockPlayer);
    });

    test('should return existing player if already setup', () => {
      const firstPlayer = queue.setupPlayer(testGuildId, mockConnection);
      const secondPlayer = queue.setupPlayer(testGuildId, mockConnection);

      expect(firstPlayer).toBe(secondPlayer);
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    });
  });

  describe('createConnection', () => {
    test('should create a voice connection', () => {
      const mockChannel = {
        id: 'channel-123',
        guild: {
          id: testGuildId,
          voiceAdapterCreator: jest.fn(),
        },
      };

      const connection = queue.createConnection(mockChannel);

      expect(mockJoinVoiceChannel).toHaveBeenCalledWith({
        channelId: mockChannel.id,
        guildId: mockChannel.guild.id,
        adapterCreator: mockChannel.guild.voiceAdapterCreator,
      });
      expect(connection).toBe(mockConnection);
    });
  });

  describe('skip', () => {
    test('should stop the current player', () => {
      queue.setupPlayer(testGuildId, mockConnection);
      queue.skip(testGuildId);

      expect(mockPlayer.stop).toHaveBeenCalled();
    });

    test('should not error if no player exists', () => {
      expect(() => queue.skip(testGuildId)).not.toThrow();
    });
  });

  describe('stop', () => {
    test('should clear queue, stop player, and destroy connection', () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.songs = [{ title: 'Test Song', url: 'test-url' }];
      queue.setupPlayer(testGuildId, mockConnection);

      queue.stop(testGuildId);

      expect(mockPlayer.stop).toHaveBeenCalled();
      expect(mockConnection.destroy).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    test('should pause the player', () => {
      queue.setupPlayer(testGuildId, mockConnection);
      queue.pause(testGuildId);

      expect(mockPlayer.pause).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    test('should unpause the player', () => {
      queue.setupPlayer(testGuildId, mockConnection);
      queue.resume(testGuildId);

      expect(mockPlayer.unpause).toHaveBeenCalled();
    });
  });

  describe('getCurrentSong', () => {
    test('should return null when no song is playing', () => {
      const currentSong = queue.getCurrentSong(testGuildId);
      expect(currentSong).toBeNull();
    });

    test('should return the current song', () => {
      const guildQueue = queue.getQueue(testGuildId);
      const testSong = { title: 'Test Song', url: 'test-url' };
      guildQueue.currentSong = testSong;

      const currentSong = queue.getCurrentSong(testGuildId);
      expect(currentSong).toBe(testSong);
    });
  });

  describe('getQueueList', () => {
    test('should return empty array for new queue', () => {
      const queueList = queue.getQueueList(testGuildId);
      expect(queueList).toEqual([]);
    });

    test('should return all queued songs', () => {
      const guildQueue = queue.getQueue(testGuildId);
      const songs = [
        { title: 'Song 1', url: 'url1' },
        { title: 'Song 2', url: 'url2' },
      ];
      guildQueue.songs = songs;

      const queueList = queue.getQueueList(testGuildId);
      expect(queueList).toEqual(songs);
    });
  });
});
