import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the music queue
jest.unstable_mockModule('../../src/utils/queue.js', () => ({
  musicQueue: {
    skip: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    getCurrentSong: jest.fn(),
    getQueueList: jest.fn(),
    getAutoplayState: jest.fn(),
  },
}));

// Import commands after mocking
const skipCommand = await import('../../src/commands/skip.js');
const stopCommand = await import('../../src/commands/stop.js');
const pauseCommand = await import('../../src/commands/pause.js');
const resumeCommand = await import('../../src/commands/resume.js');
const queueCommand = await import('../../src/commands/queue.js');
const nowPlayingCommand = await import('../../src/commands/nowplaying.js');
const { musicQueue } = await import('../../src/utils/queue.js');

describe('Control Commands', () => {
  let mockInteraction;
  let mockVoiceChannel;

  beforeEach(() => {
    jest.clearAllMocks();

    mockVoiceChannel = {
      id: 'voice-channel-123',
    };

    mockInteraction = {
      member: {
        voice: {
          channel: mockVoiceChannel,
        },
      },
      guildId: 'guild-123',
      reply: jest.fn(),
      editReply: jest.fn(),
    };
  });

  describe('Skip Command', () => {
    test('should have correct command data', () => {
      expect(skipCommand.data.name).toBe('skip');
      expect(skipCommand.data.description).toBe('Skip the current song');
    });

    test('should require user to be in voice channel', async () => {
      mockInteraction.member.voice.channel = null;

      await skipCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'You need to be in a voice channel to use this command!'
      );
    });

    test('should skip current song', async () => {
      musicQueue.getCurrentSong.mockReturnValue({
        title: 'Current Song',
        url: 'test-url',
      });

      await skipCommand.execute(mockInteraction);

      expect(musicQueue.skip).toHaveBeenCalledWith('guild-123');
      expect(mockInteraction.reply).toHaveBeenCalledWith('Skipped the current song!');
    });

    test('should handle no song playing', async () => {
      musicQueue.getCurrentSong.mockReturnValue(null);

      await skipCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'There is no song currently playing!'
      );
    });
  });

  describe('Stop Command', () => {
    test('should have correct command data', () => {
      expect(stopCommand.data.name).toBe('stop');
      expect(stopCommand.data.description).toBe('Stop playing music and clear the queue');
    });

    test('should require user to be in voice channel', async () => {
      mockInteraction.member.voice.channel = null;

      await stopCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'You need to be in a voice channel to use this command!'
      );
    });

    test('should stop playback and clear queue', async () => {
      await stopCommand.execute(mockInteraction);

      expect(musicQueue.stop).toHaveBeenCalledWith('guild-123');
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Stopped playing music and cleared the queue!'
      );
    });
  });

  describe('Pause Command', () => {
    test('should have correct command data', () => {
      expect(pauseCommand.data.name).toBe('pause');
      expect(pauseCommand.data.description).toBe('Pause the current song');
    });

    test('should require user to be in voice channel', async () => {
      mockInteraction.member.voice.channel = null;

      await pauseCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'You need to be in a voice channel to use this command!'
      );
    });

    test('should pause current song', async () => {
      musicQueue.getCurrentSong.mockReturnValue({
        title: 'Current Song',
        url: 'test-url',
      });

      await pauseCommand.execute(mockInteraction);

      expect(musicQueue.pause).toHaveBeenCalledWith('guild-123');
      expect(mockInteraction.reply).toHaveBeenCalledWith('Paused the current song!');
    });

    test('should handle no song playing', async () => {
      musicQueue.getCurrentSong.mockReturnValue(null);

      await pauseCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'There is no song currently playing!'
      );
    });
  });

  describe('Resume Command', () => {
    test('should have correct command data', () => {
      expect(resumeCommand.data.name).toBe('resume');
      expect(resumeCommand.data.description).toBe('Resume the paused song');
    });

    test('should require user to be in voice channel', async () => {
      mockInteraction.member.voice.channel = null;

      await resumeCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'You need to be in a voice channel to use this command!'
      );
    });

    test('should resume paused song', async () => {
      musicQueue.getCurrentSong.mockReturnValue({
        title: 'Current Song',
        url: 'test-url',
      });

      await resumeCommand.execute(mockInteraction);

      expect(musicQueue.resume).toHaveBeenCalledWith('guild-123');
      expect(mockInteraction.reply).toHaveBeenCalledWith('Resumed the song!');
    });

    test('should handle no song playing', async () => {
      musicQueue.getCurrentSong.mockReturnValue(null);

      await resumeCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'There is no song currently playing!'
      );
    });
  });

  describe('Queue Command', () => {
    test('should have correct command data', () => {
      expect(queueCommand.data.name).toBe('queue');
      expect(queueCommand.data.description).toBe('Show the current music queue');
    });

    test('should show empty queue message', async () => {
      musicQueue.getCurrentSong.mockReturnValue(null);
      musicQueue.getQueueList.mockReturnValue([]);

      await queueCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith('The queue is empty!');
    });

    test('should display current song and queue', async () => {
      const currentSong = {
        title: 'Current Song',
        requestedBy: 'User#1234',
      };
      const queueList = [
        currentSong,
        { title: 'Song 2' },
        { title: 'Song 3' },
      ];

      musicQueue.getCurrentSong.mockReturnValue(currentSong);
      musicQueue.getQueueList.mockReturnValue(queueList);

      await queueCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      expect(replyCall.embeds[0].data.title).toBe('Music Queue');
    });
  });

  describe('Now Playing Command', () => {
    test('should have correct command data', () => {
      expect(nowPlayingCommand.data.name).toBe('nowplaying');
      expect(nowPlayingCommand.data.description).toBe('Show the currently playing song');
    });

    test('should show no song playing message', async () => {
      musicQueue.getCurrentSong.mockReturnValue(null);

      await nowPlayingCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'There is no song currently playing!'
      );
    });

    test('should display current song info', async () => {
      const currentSong = {
        title: 'Test Song',
        duration: 213,
        requestedBy: 'User#1234',
        thumbnail: 'https://example.com/thumb.jpg',
      };

      musicQueue.getCurrentSong.mockReturnValue(currentSong);

      await nowPlayingCommand.execute(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
      const replyCall = mockInteraction.reply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      expect(replyCall.embeds[0].data.title).toBe('Now Playing');
    });

    test('should format duration correctly', async () => {
      const currentSong = {
        title: 'Test Song',
        duration: 125, // 2:05
        requestedBy: 'User#1234',
      };

      musicQueue.getCurrentSong.mockReturnValue(currentSong);

      await nowPlayingCommand.execute(mockInteraction);

      const replyCall = mockInteraction.reply.mock.calls[0][0];
      const durationField = replyCall.embeds[0].data.fields.find(
        (f) => f.name === 'Duration'
      );
      expect(durationField.value).toBe('2:05');
    });
  });
});
