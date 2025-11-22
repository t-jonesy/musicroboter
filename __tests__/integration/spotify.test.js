import { describe, test, expect } from '@jest/globals';

describe('Spotify Integration', () => {
  test('should authenticate with Spotify and fetch track info', async () => {
    // Test URL: https://open.spotify.com/track/301deUoXxEbO2E1QGFU6Um
    const spotifyUrl = 'https://open.spotify.com/track/301deUoXxEbO2E1QGFU6Um';

    const clientId = process.env.SPOTIFY_CLIENT_ID || '5ba34d074943422884e697e3d39c433c';
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || 'e9930d7d07c1434f920d454168fdf925';

    // Extract track ID
    const trackIdMatch = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/);
    expect(trackIdMatch).not.toBeNull();
    const trackId = trackIdMatch[1];

    // Get access token using client credentials flow
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    const tokenData = await tokenResponse.json();
    expect(tokenData.access_token).toBeDefined();

    console.log('Got Spotify access token:', tokenData.access_token.substring(0, 20) + '...');

    // Get track info from Spotify API
    const trackResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const trackData = await trackResponse.json();

    expect(trackData).toBeDefined();
    expect(trackData.error).toBeUndefined();
    expect(trackData.name).toBeDefined();
    expect(trackData.artists).toBeDefined();
    expect(trackData.artists.length).toBeGreaterThan(0);

    console.log('Spotify track info:', {
      name: trackData.name,
      artist: trackData.artists[0].name,
      id: trackData.id
    });
  }, 30000); // 30 second timeout for API call
});
