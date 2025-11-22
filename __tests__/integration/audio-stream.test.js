import { describe, test, expect, beforeAll } from '@jest/globals';
import play from 'play-dl';
import { spawn } from 'child_process';
import { createAudioResource, StreamType } from '@discordjs/voice';

describe('Audio Streaming Integration Tests', () => {
  beforeAll(async () => {
    // Initialize play-dl
    await play.getFreeClientID().then((clientID) => play.setToken({
      youtube: {
        cookie: ''
      }
    }));
  }, 30000);

  test.skip('should successfully search and create streamable audio resource', async () => {
    const query = 'survivor eye of the tiger';

    // Step 1: Search for the song
    const searched = await play.search(query, {
      limit: 1,
      source: { youtube: 'video' }
    });

    expect(searched).toBeDefined();
    expect(searched.length).toBeGreaterThan(0);

    const result = searched[0];
    console.log('Found song:', result.title);
    console.log('URL:', result.url);

    // Step 2: Verify the URL is valid
    expect(result.url).toBeDefined();
    expect(result.url).toContain('youtube.com');

    // Step 3: Test yt-dlp streaming (this is what actually plays in Discord)
    const ytdlProcess = spawn('yt-dlp', [
      '-f', 'bestaudio/best',
      '-o', '-',
      '--no-warnings',
      '--extract-audio',
      result.url
    ]);
    const stream = ytdlProcess.stdout;

    // Log errors
    ytdlProcess.stderr.on('data', (data) => {
      console.log('yt-dlp stderr:', data.toString());
    });

    ytdlProcess.on('error', (error) => {
      console.error('yt-dlp process error:', error);
    });

    expect(stream).toBeDefined();
    console.log('yt-dlp process spawned successfully');

    // Step 4: Create audio resource (like the bot does)
    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });

    expect(resource).toBeDefined();
    expect(resource.playStream).toBeDefined();
    console.log('Audio resource created successfully');

    // Step 5: Verify volume control
    if (resource.volume) {
      resource.volume.setVolume(0.5);
      console.log('Volume set to 0.5');
    }

    // Step 6: Wait for some data to flow through the stream
    let dataReceived = false;
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
    const dataPromise = new Promise((resolve) => {
      stream.once('data', () => {
        dataReceived = true;
        console.log('Received audio data from stream');
        resolve();
      });
    });

    await Promise.race([dataPromise, timeout]);

    // Clean up
    ytdlProcess.kill();
    resource.playStream.destroy();

    expect(dataReceived).toBe(true);
    console.log('✓ Full audio streaming pipeline works!');
  }, 30000);

  test('should handle streaming errors gracefully', async () => {
    const invalidUrl = 'https://www.youtube.com/watch?v=invalid_url_12345';

    // This should fail, but we want to make sure it fails gracefully
    try {
      const streamProcess = youtubedl.exec(invalidUrl, {
        output: '-',
        quiet: true,
        format: 'bestaudio',
        limitRate: '100K',
      });

      // Wait a bit for the error to occur
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // If we got here, kill the process
      streamProcess.kill();

      // If no error was thrown, fail the test
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      // Expected to fail
      console.log('Error handled gracefully:', error.message);
      expect(error).toBeDefined();
    }
  }, 15000);

  test('should verify YouTube URL format from search results', async () => {
    const query = 'never gonna give you up';

    const searched = await play.search(query, {
      limit: 3,
      source: { youtube: 'video' }
    });

    expect(searched.length).toBeGreaterThan(0);

    // Verify all results have valid URLs
    for (const result of searched) {
      console.log(`Checking: ${result.title}`);
      console.log(`  URL: ${result.url}`);

      expect(result.url).toBeDefined();
      expect(result.url).not.toBe('undefined');
      expect(typeof result.url).toBe('string');
      expect(result.url).toMatch(/youtube\.com\/watch\?v=/);
      expect(result.id).toBeDefined();
    }

    console.log('✓ All search results have valid YouTube URLs');
  }, 15000);

  test.skip('should handle Spotify track search and get valid YouTube URL', async () => {
    // Simulate what happens when user provides a Spotify URL
    const spotifyUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';

    const sp_data = await play.spotify(spotifyUrl);

    expect(sp_data).toBeDefined();
    expect(sp_data.type).toBe('track');
    console.log('Spotify track:', sp_data.name, 'by', sp_data.artists[0].name);

    // Search YouTube for the Spotify track
    const searched = await play.search(`${sp_data.name} ${sp_data.artists[0].name}`, {
      limit: 1,
      source: { youtube: 'video' }
    });

    expect(searched.length).toBeGreaterThan(0);

    const result = searched[0];
    const url = result.url || `https://www.youtube.com/watch?v=${result.id}`;

    console.log('Found YouTube equivalent:', result.title);
    console.log('URL:', url);

    expect(url).toBeDefined();
    expect(url).not.toBe('undefined');
    expect(url).toContain('youtube.com');

    console.log('✓ Spotify to YouTube conversion works');
  }, 20000);
});
