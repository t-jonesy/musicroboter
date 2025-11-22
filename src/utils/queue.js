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
      });
    }
    return this.queues.get(guildId);
  }

  async addSong(guildId, song, playNext = false) {
    const queue = this.getQueue(guildId);

    if (playNext && queue.isPlaying) {
      // Add to front of queue (position 1, right after currently playing song)
      queue.songs.splice(1, 0, song);
    } else {
      // Add to end of queue
      queue.songs.push(song);
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
   * Plays the current song in the queue
   * @param {string} guildId - The Discord guild ID
   */
  async playSong(guildId) {
    const queue = this.getQueue(guildId);

    if (queue.songs.length === 0) {
      queue.isPlaying = false;
      queue.currentSong = null;
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
}

export { MusicQueue };
export const musicQueue = new MusicQueue();
