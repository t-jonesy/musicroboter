import { createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, joinVoiceChannel, StreamType } from '@discordjs/voice';
import play from 'play-dl';
import { spawn } from 'child_process';
import { audioCache } from './cache.js';

class MusicQueue {
  constructor() {
    this.queues = new Map();
    // Initialize cache
    audioCache.initialize().catch(err => {
      console.error('[Queue] Failed to initialize audio cache:', err);
    });
  }

  getQueue(guildId) {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, {
        songs: [],
        connection: null,
        player: null,
        isPlaying: false,
        currentSong: null,
        autoplay: false,
        autoplayHistory: [], // Track played songs to avoid repeats
      });
    }
    return this.queues.get(guildId);
  }

  async addSong(guildId, song, isUserRequested = true, playNext = false) {
    const queue = this.getQueue(guildId);

    if (isUserRequested) {
      // User-requested songs
      // Remove any autoplay songs from the queue
      queue.songs = queue.songs.filter(s => s.isUserRequested !== false);

      if (playNext && queue.isPlaying) {
        // Add to front of queue (position 1, right after currently playing song)
        queue.songs.splice(1, 0, song);
      } else {
        // Add to end of queue
        queue.songs.push(song);
      }

      song.isUserRequested = true;
    } else {
      // Autoplay songs only added if no user-requested songs in queue
      if (queue.songs.length === 0) {
        queue.songs.push(song);
        song.isUserRequested = false;
      }
    }

    // Preload songs immediately when added to queue
    this.preloadNextSongs(guildId);

    if (!queue.isPlaying) {
      await this.playSong(guildId);
    }
  }

  /**
   * Preloads the next song(s) in the queue into cache for instant playback
   * @param {string} guildId - The Discord guild ID
   */
  async preloadNextSongs(guildId) {
    const queue = this.getQueue(guildId);

    if (queue.songs.length === 0) {
      return; // Nothing to preload
    }

    // Determine which songs to preload based on playback state
    let songsToPreload;
    if (queue.isPlaying) {
      // Currently playing - preload next 2-3 songs (skip current at index 0)
      songsToPreload = queue.songs.slice(1, 4);
    } else {
      // Not playing yet - preload first song and next 2-3
      songsToPreload = queue.songs.slice(0, 3);
    }

    for (const song of songsToPreload) {
      // Don't await - fire and forget for background preloading
      audioCache.preload(song.url).catch(err => {
        console.error(`[Guild ${guildId}] Failed to preload ${song.title}:`, err);
      });
    }
  }

  /**
   * Find a related song for autoplay based on the last played song
   * @param {string} guildId - The Discord guild ID
   * @returns {Promise<Object|null>} Related song info or null
   */
  async findRelatedSong(guildId) {
    const queue = this.getQueue(guildId);

    if (!queue.currentSong) {
      return null;
    }

    try {
      // Search for related songs using the current song's artist and title
      const searchQuery = `${queue.currentSong.artist || ''} ${queue.currentSong.title}`.trim();
      console.log(`[Guild ${guildId}] Searching for songs related to: ${searchQuery}`);

      // Try searching with "explicit" first for better quality
      let searched = await play.search(`${searchQuery} explicit`, {
        limit: 10,
        source: { youtube: 'video' }
      });

      // If no results with explicit, try without it
      if (!searched || searched.length === 0) {
        searched = await play.search(searchQuery, {
          limit: 10,
          source: { youtube: 'video' }
        });
      }

      if (!searched || searched.length === 0) {
        console.log(`[Guild ${guildId}] No related songs found`);
        return null;
      }

      // Filter out songs we've already played in this session
      let unplayed = searched.filter(result => {
        const id = result.id || result.url;
        return !queue.autoplayHistory.includes(id);
      });

      if (unplayed.length === 0) {
        // Reset history if we've played everything
        console.log(`[Guild ${guildId}] Autoplay history reset`);
        queue.autoplayHistory = [];
        return this.findRelatedSong(guildId);
      }

      // Prefer explicit/uncensored versions
      const explicitResults = unplayed.filter(result =>
        /explicit|uncensored|unedited|parental advisory/i.test(result.title)
      );

      // Use explicit results if available, otherwise use all unplayed
      const candidatePool = explicitResults.length > 0 ? explicitResults : unplayed;

      // Pick a random song from the results (not the first one which is likely the same song)
      const randomIndex = Math.floor(Math.random() * Math.min(candidatePool.length, 5)) + 1;
      const selectedIndex = Math.min(randomIndex, candidatePool.length - 1);
      const result = candidatePool[selectedIndex];

      const url = result.url || `https://www.youtube.com/watch?v=${result.id}`;
      const songId = result.id || result.url;

      // Add to history
      queue.autoplayHistory.push(songId);

      // Keep history size reasonable (last 50 songs)
      if (queue.autoplayHistory.length > 50) {
        queue.autoplayHistory.shift();
      }

      console.log(`[Guild ${guildId}] Found related song: ${result.title}`);

      return {
        title: result.title,
        url: url,
        artist: result.channel?.name || 'Unknown Artist',
        duration: result.durationInSec || 0,
        isUserRequested: false,
      };
    } catch (error) {
      console.error(`[Guild ${guildId}] Error finding related song:`, error);
      return null;
    }
  }

  /**
   * Plays the current song in the queue
   * @param {string} guildId - The Discord guild ID
   */
  async playSong(guildId) {
    const queue = this.getQueue(guildId);

    if (queue.songs.length === 0) {
      // Store current song for autoplay search before clearing
      const previousSong = queue.currentSong;

      // Immediately clear playing state
      queue.isPlaying = false;
      queue.currentSong = null;

      // Check if autoplay is enabled
      if (queue.autoplay && previousSong) {
        console.log(`[Guild ${guildId}] Queue empty, searching for autoplay song...`);
        // Temporarily restore currentSong for findRelatedSong to work
        queue.currentSong = previousSong;
        const relatedSong = await this.findRelatedSong(guildId);
        queue.currentSong = null; // Clear again after search

        if (relatedSong) {
          await this.addSong(guildId, relatedSong, false);
          return; // addSong will call playSong if needed
        }
      }

      console.log(`[Guild ${guildId}] Queue finished`);
      return;
    }

    const song = queue.songs[0];
    queue.currentSong = song;
    queue.isPlaying = true;

    try {
      // Try to get from cache first, otherwise download
      console.log(`[Guild ${guildId}] Playing song: ${song.title}`);
      const stream = await audioCache.download(song.url);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });

      if (resource.volume) {
        resource.volume.setVolume(0.5);
      }

      queue.player.play(resource);

      // Preload next songs in background
      this.preloadNextSongs(guildId);

      queue.player.once(AudioPlayerStatus.Idle, () => {
        queue.songs.shift();
        this.playSong(guildId);
      });
    } catch (error) {
      console.error(`[Guild ${guildId}] Error playing song:`, error);
      queue.songs.shift();
      this.playSong(guildId);
    }
  }

  createConnection(channel) {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    return connection;
  }

  setupPlayer(guildId, connection) {
    const queue = this.getQueue(guildId);

    if (!queue.player) {
      queue.player = createAudioPlayer();
      queue.connection = connection;
      connection.subscribe(queue.player);
    }

    return queue.player;
  }

  skip(guildId) {
    const queue = this.getQueue(guildId);

    // Don't clean up preloaded resources - they're for the next song!
    // The preloaded resource will be used when playSong() is called for the next song

    if (queue.player) {
      queue.player.stop();
    }
  }

  stop(guildId) {
    const queue = this.getQueue(guildId);

    queue.songs = [];
    if (queue.player) {
      queue.player.stop();
    }
    if (queue.connection) {
      queue.connection.destroy();
    }
    this.queues.delete(guildId);
  }

  pause(guildId) {
    const queue = this.getQueue(guildId);
    if (queue.player) {
      queue.player.pause();
    }
  }

  resume(guildId) {
    const queue = this.getQueue(guildId);
    if (queue.player) {
      queue.player.unpause();
    }
  }

  getCurrentSong(guildId) {
    const queue = this.getQueue(guildId);
    return queue.currentSong;
  }

  getQueueList(guildId) {
    const queue = this.getQueue(guildId);
    return queue.songs;
  }

  /**
   * Toggle autoplay on or off
   * @param {string} guildId - The Discord guild ID
   * @returns {boolean} The new autoplay state
   */
  toggleAutoplay(guildId) {
    const queue = this.getQueue(guildId);
    queue.autoplay = !queue.autoplay;
    console.log(`[Guild ${guildId}] Autoplay ${queue.autoplay ? 'enabled' : 'disabled'}`);
    return queue.autoplay;
  }

  /**
   * Get autoplay state
   * @param {string} guildId - The Discord guild ID
   * @returns {boolean} Current autoplay state
   */
  getAutoplayState(guildId) {
    const queue = this.getQueue(guildId);
    return queue.autoplay;
  }
}

export { MusicQueue };
export const musicQueue = new MusicQueue();
