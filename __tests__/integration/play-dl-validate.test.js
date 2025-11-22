import { describe, test, expect } from '@jest/globals';
import play from 'play-dl';

describe('play-dl Validation Tests', () => {
  test('should validate and stream a YouTube video', async () => {
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

    const result = searched[0];
    console.log('Found video:', result.title);
    console.log('Video URL:', result.url);

    // Try validate method first
    const validated = await play.validate(result.url);
    console.log('Validation result:', validated);

    if (validated === 'yt_video') {
      console.log('URL is valid YouTube video');

      // Get video info
      const videoInfo = await play.video_info(result.url);
      console.log('Video info title:', videoInfo.video_details.title);
      console.log('Video info url:', videoInfo.video_details.url);

      // Try streaming
      try {
        const stream = await play.stream(result.url);
        console.log('Stream successful! Type:', stream.type);
        expect(stream).toBeDefined();
      } catch (error) {
        console.error('Stream error:', error.message);
        throw error;
      }
    }
  }, 30000);
});
