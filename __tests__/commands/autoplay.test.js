import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock the queue module
const mockToggleAutoplay = jest.fn();
jest.unstable_mockModule('../../src/utils/queue.js', () => ({
  musicQueue: {
    toggleAutoplay: mockToggleAutoplay,
  },
}));

// Import the command after mocking
const { data, execute } = await import('../../src/commands/autoplay.js');

describe('Autoplay Command', () => {
  let mockInteraction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInteraction = {
      guild: {
        id: 'test-guild-123',
      },
      reply: jest.fn(),
    };
  });

  test('should have correct command data', () => {
    expect(data.name).toBe('autoplay');
    expect(data.description).toBeDefined();
  });

  test('should reply with enabled message when toggled on', async () => {
    mockToggleAutoplay.mockReturnValue(true);

    await execute(mockInteraction);

    expect(mockToggleAutoplay).toHaveBeenCalledWith('test-guild-123');
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('enabled'),
      ephemeral: true,
    });
  });

  test('should reply with disabled message when toggled off', async () => {
    mockToggleAutoplay.mockReturnValue(false);

    await execute(mockInteraction);

    expect(mockToggleAutoplay).toHaveBeenCalledWith('test-guild-123');
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('disabled'),
      ephemeral: true,
    });
  });

  test('should handle errors gracefully', async () => {
    mockToggleAutoplay.mockImplementation(() => {
      throw new Error('Test error');
    });

    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('error'),
      ephemeral: true,
    });
  });
});
