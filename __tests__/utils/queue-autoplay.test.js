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
const mockSearch = jest.fn();
jest.unstable_mockModule('play-dl', () => ({
  default: {
    search: mockSearch,
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

describe('MusicQueue Autoplay', () => {
  let queue;
  let mockPlayer;
  let mockConnection;
  let mockProcess;
  let mockStdout;
  const testGuildId = 'test-guild-123';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock stdout
    mockStdout = {
      on: jest.fn(),
      once: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
    };

    // Setup mock process
    mockProcess = {
      stdout: mockStdout,
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
    };

    mockSpawn.mockReturnValue(mockProcess);

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

    // Setup mock resource
    const mockResource = {
      playStream: { destroy: jest.fn() },
      volume: {
        setVolume: jest.fn(),
      },
    };

    mockCreateAudioPlayer.mockReturnValue(mockPlayer);
    mockJoinVoiceChannel.mockReturnValue(mockConnection);
    mockCreateAudioResource.mockReturnValue(mockResource);

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

  describe('toggleAutoplay', () => {
    test('should toggle autoplay from off to on', () => {
      const result = queue.toggleAutoplay(testGuildId);

      expect(result).toBe(true);
      expect(queue.getAutoplayState(testGuildId)).toBe(true);
    });

    test('should toggle autoplay from on to off', () => {
      queue.toggleAutoplay(testGuildId); // Turn on
      const result = queue.toggleAutoplay(testGuildId); // Turn off

      expect(result).toBe(false);
      expect(queue.getAutoplayState(testGuildId)).toBe(false);
    });
  });

  describe('getAutoplayState', () => {
    test('should return false by default', () => {
      const state = queue.getAutoplayState(testGuildId);
      expect(state).toBe(false);
    });

    test('should return true when enabled', () => {
      queue.toggleAutoplay(testGuildId);
      const state = queue.getAutoplayState(testGuildId);
      expect(state).toBe(true);
    });
  });

  describe('autoplay queue initialization', () => {
    test('should initialize with autoplay fields', () => {
      const guildQueue = queue.getQueue(testGuildId);

      expect(guildQueue).toHaveProperty('autoplay');
      expect(guildQueue).toHaveProperty('autoplayHistory');
      expect(guildQueue.autoplay).toBe(false);
      expect(guildQueue.autoplayHistory).toEqual([]);
    });
  });

  describe('findRelatedSong', () => {
    test('should return null if no current song', async () => {
      const result = await queue.findRelatedSong(testGuildId);
      expect(result).toBeNull();
    });

    test('should find related song based on current song', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.currentSong = {
        title: 'Test Song',
        artist: 'Test Artist',
      };

      // Mock search results
      mockSearch.mockResolvedValue([
        { id: '1', title: 'Same Song', channel: { name: 'Test Artist' }, durationInSec: 180, url: 'url1' },
        { id: '2', title: 'Related Song 1', channel: { name: 'Similar Artist' }, durationInSec: 200, url: 'url2' },
        { id: '3', title: 'Related Song 2', channel: { name: 'Another Artist' }, durationInSec: 220, url: 'url3' },
      ]);

      const result = await queue.findRelatedSong(testGuildId);

      // Search may be called with "explicit" appended
      expect(mockSearch).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.isUserRequested).toBe(false);
      expect(result.url).toBeDefined();
    });

    test('should track played songs in history', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.currentSong = {
        title: 'Test Song',
        artist: 'Test Artist',
      };

      mockSearch.mockResolvedValue([
        { id: '2', title: 'Related Song', channel: { name: 'Artist' }, durationInSec: 200, url: 'url2' },
      ]);

      await queue.findRelatedSong(testGuildId);

      expect(guildQueue.autoplayHistory).toContain('2');
    });

    test('should filter out already played songs', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.currentSong = {
        title: 'Test Song',
        artist: 'Test Artist',
      };
      guildQueue.autoplayHistory = ['1', '2'];

      mockSearch.mockResolvedValue([
        { id: '1', title: 'Already Played 1', channel: { name: 'Artist' }, durationInSec: 180, url: 'url1' },
        { id: '2', title: 'Already Played 2', channel: { name: 'Artist' }, durationInSec: 200, url: 'url2' },
        { id: '3', title: 'New Song', channel: { name: 'Artist' }, durationInSec: 220, url: 'url3' },
      ]);

      const result = await queue.findRelatedSong(testGuildId);

      expect(result.url).toBe('url3');
    });

    test('should return null when no results found', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.currentSong = {
        title: 'Test Song',
        artist: 'Test Artist',
      };

      mockSearch.mockResolvedValue([]);

      const result = await queue.findRelatedSong(testGuildId);

      expect(result).toBeNull();
    });
  });

  describe('addSong with autoplay', () => {
    test('should mark user-requested songs appropriately', async () => {
      const song = { title: 'User Song', url: 'url1' };
      queue.setupPlayer(testGuildId, mockConnection);

      await queue.addSong(testGuildId, song, true);

      expect(song.isUserRequested).toBe(true);
    });

    test('should mark autoplay songs appropriately', async () => {
      const song = { title: 'Autoplay Song', url: 'url1' };
      queue.setupPlayer(testGuildId, mockConnection);

      await queue.addSong(testGuildId, song, false);

      expect(song.isUserRequested).toBe(false);
    });

    test('should remove autoplay songs when user song is added', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      const autoplaySong = { title: 'Autoplay Song', url: 'url1', isUserRequested: false };
      const userSong = { title: 'User Song', url: 'url2' };

      guildQueue.songs = [autoplaySong];
      queue.setupPlayer(testGuildId, mockConnection);

      await queue.addSong(testGuildId, userSong, true);

      // Autoplay song should be removed
      expect(guildQueue.songs.find(s => s.title === 'Autoplay Song')).toBeUndefined();
      expect(guildQueue.songs.find(s => s.title === 'User Song')).toBeDefined();
    });

    test('should not add autoplay song if queue has songs', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      const existingSong = { title: 'Existing Song', url: 'url1', isUserRequested: true };
      const autoplaySong = { title: 'Autoplay Song', url: 'url2' };

      guildQueue.songs = [existingSong];
      guildQueue.isPlaying = true; // Prevent playSong from being called

      await queue.addSong(testGuildId, autoplaySong, false);

      expect(guildQueue.songs.length).toBe(1);
      expect(guildQueue.songs[0].title).toBe('Existing Song');
    });
  });

  describe('playSong with autoplay', () => {
    test('should trigger autoplay when queue is empty and autoplay is enabled', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.autoplay = true;
      guildQueue.currentSong = {
        title: 'Previous Song',
        artist: 'Previous Artist',
      };
      guildQueue.songs = []; // Empty queue

      queue.setupPlayer(testGuildId, mockConnection);

      mockSearch.mockResolvedValue([
        { id: '1', title: 'Same Song', channel: { name: 'Artist' }, durationInSec: 180, url: 'url1' },
        { id: '2', title: 'Related Song', channel: { name: 'Artist' }, durationInSec: 200, url: 'url2' },
      ]);

      await queue.playSong(testGuildId);

      // Should have searched for related songs
      expect(mockSearch).toHaveBeenCalled();
    });

    test('should not trigger autoplay when disabled', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.autoplay = false;
      guildQueue.currentSong = {
        title: 'Previous Song',
        artist: 'Previous Artist',
      };
      guildQueue.songs = []; // Empty queue

      queue.setupPlayer(testGuildId, mockConnection);

      await queue.playSong(testGuildId);

      // Should not search for related songs
      expect(mockSearch).not.toHaveBeenCalled();
      expect(guildQueue.isPlaying).toBe(false);
    });

    test('should clear currentSong immediately when queue empties', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.autoplay = false;
      guildQueue.currentSong = {
        title: 'Last Song',
        artist: 'Artist',
      };
      guildQueue.songs = []; // Empty queue

      queue.setupPlayer(testGuildId, mockConnection);

      await queue.playSong(testGuildId);

      // currentSong should be cleared immediately
      expect(guildQueue.currentSong).toBeNull();
      expect(guildQueue.isPlaying).toBe(false);
    });

    test('should clear currentSong even when autoplay is enabled and searching', async () => {
      const guildQueue = queue.getQueue(testGuildId);
      guildQueue.autoplay = true;
      guildQueue.currentSong = {
        title: 'Last Song',
        artist: 'Artist',
      };
      guildQueue.songs = []; // Empty queue
      guildQueue.isPlaying = true; // Prevent immediate playSong call from addSong

      queue.setupPlayer(testGuildId, mockConnection);

      // Make search return immediately
      mockSearch.mockResolvedValue([
        { id: '1', title: 'Related', channel: { name: 'Artist' }, durationInSec: 180, url: 'url1' },
      ]);

      await queue.playSong(testGuildId);

      // After playSong completes with autoplay, currentSong should be set to the new song
      expect(guildQueue.currentSong).not.toBeNull();
      expect(guildQueue.currentSong.title).toBe('Related');
    });
  });
});
