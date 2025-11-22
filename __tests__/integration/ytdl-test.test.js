import { describe, test, expect } from '@jest/globals';
import play from 'play-dl';
import ytdl from '@distube/ytdl-core';

describe('ytdl-core Integration Test', () => {
  test('should search with play-dl and stream with ytdl-core', async () => {
    // Initialize play-dl for search
    await play.getFreeClientID().then((clientID) => play.setToken({
      youtube: {
        cookie: ''
      }
    }));

    // Search for the song
    const query = 'survivor eye of the tiger';
    const searched = await play.search(query, {
      limit: 1,
      source: { youtube: 'video' }
    });

    expect(searched).toBeDefined();
    expect(searched.length).toBeGreaterThan(0);

    const result = searched[0];
    console.log('Found:', result.title);
    console.log('URL:', result.url);

    // Validate the URL with ytdl
    const isValid = ytdl.validateURL(result.url);
    console.log('Is valid YouTube URL:', isValid);
    expect(isValid).toBe(true);

    // Get video info with ytdl
    const info = await ytdl.getInfo(result.url);
    console.log('Video title from ytdl:', info.videoDetails.title);
    console.log('Video duration:', info.videoDetails.lengthSeconds, 'seconds');
    console.log('Has audio formats:', info.formats.filter(f => f.hasAudio).length > 0);

    expect(info).toBeDefined();
    expect(info.videoDetails).toBeDefined();

    // Test that we can create a stream (don't actually stream, just verify it's creatable)
    const streamOptions = {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
    };

    // This creates the stream object but we won't actually download
    const stream = ytdl(result.url, streamOptions);
    expect(stream).toBeDefined();
    console.log('Stream created successfully!');

    // Clean up - destroy the stream
    stream.destroy();
  }, 30000);
});
