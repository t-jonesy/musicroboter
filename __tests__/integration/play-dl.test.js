import { describe, test, expect } from '@jest/globals';
import play from 'play-dl';

describe('play-dl Integration Tests', () => {
  test('should search for "survivor eye of the tiger" and return valid results', async () => {
    // Initialize play-dl
    await play.getFreeClientID().then((clientID) => play.setToken({
      youtube: {
        cookie: ''
      }
    }));

    const query = 'survivor eye of the tiger';
    const searched = await play.search(query, {
      limit: 1,
      source: { youtube: 'video' }
    });

    console.log('Search results:', JSON.stringify(searched, null, 2));

    expect(searched).toBeDefined();
    expect(searched.length).toBeGreaterThan(0);

    const result = searched[0];
    console.log('First result properties:', Object.keys(result));
    console.log('Result title:', result.title);
    console.log('Result url:', result.url);
    console.log('Result id:', result.id);

    // Check what properties are available
    expect(result.title).toBeDefined();

    // Try to get the URL
    const videoUrl = result.url || `https://www.youtube.com/watch?v=${result.id}`;
    console.log('Constructed URL:', videoUrl);
    expect(videoUrl).toBeDefined();
    expect(videoUrl).toContain('youtube.com');
  }, 30000);

  test('should be able to stream the found video', async () => {
    await play.getFreeClientID().then((clientID) => play.setToken({
      youtube: {
        cookie: ''
      }
    }));

    const query = 'survivor eye of the tiger';
    const searched = await play.search(query, {
      limit: 1,
      source: { youtube: 'video' }
    });

    const result = searched[0];
    const videoUrl = result.url || `https://www.youtube.com/watch?v=${result.id}`;

    console.log('Attempting to stream URL:', videoUrl);

    // Try to get stream
    const stream = await play.stream(videoUrl);

    console.log('Stream type:', stream.type);
    console.log('Stream has stream property:', !!stream.stream);

    expect(stream).toBeDefined();
    expect(stream.stream).toBeDefined();
    expect(stream.type).toBeDefined();
  }, 30000);
});
