import { SlashCommandBuilder } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import play from 'play-dl';
import { musicQueue } from '../utils/queue.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a song from Spotify or YouTube')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Song name, Spotify URL, or YouTube URL')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString('query');
  const member = interaction.member;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.editReply('You need to be in a voice channel to play music!');
  }

  try {
    let songInfo;
    let url;

    // Check if it's a Spotify URL
    if (query.includes('spotify.com')) {
      // Extract Spotify track ID from URL
      const trackIdMatch = query.match(/track\/([a-zA-Z0-9]+)/);

      if (!trackIdMatch) {
        return interaction.editReply('Invalid Spotify URL. Please use a track URL!');
      }

      const trackId = trackIdMatch[1];

      // Get Spotify access token using client credentials
      const { config } = await import('../config.js');
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(config.spotify.clientId + ':' + config.spotify.clientSecret).toString('base64')
        },
        body: 'grant_type=client_credentials'
      });

      const tokenData = await tokenResponse.json();

      // Get track info from Spotify API
      const trackResponse = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });

      const trackData = await trackResponse.json();

      if (trackData.error) {
        return interaction.editReply(`Spotify error: ${trackData.error.message}`);
      }

      // Search YouTube for the Spotify track
      const searched = await play.search(`${trackData.name} ${trackData.artists[0].name}`, {
        limit: 1,
        source: { youtube: 'video' }
      });

      if (!searched || searched.length === 0) {
        return interaction.editReply('Could not find that song on YouTube!');
      }

      songInfo = searched[0];
      url = searched[0].url || `https://www.youtube.com/watch?v=${searched[0].id}`;
    }
    // Check if it's a YouTube URL
    else if (query.includes('youtube.com') || query.includes('youtu.be')) {
      const yt_info = await play.video_info(query);
      songInfo = yt_info.video_details;
      url = query; // Use the original URL for YouTube links
    }
    // Search YouTube
    else {
      // First try to search with "explicit" keyword
      let searched = await play.search(`${query} explicit`, {
        limit: 5,
        source: { youtube: 'video' }
      });

      // If no results with "explicit", search without it
      if (!searched || searched.length === 0) {
        searched = await play.search(query, {
          limit: 5,
          source: { youtube: 'video' }
        });
      }

      if (!searched || searched.length === 0) {
        return interaction.editReply('No results found!');
      }

      // Prefer results with "explicit", "uncensored", or "unedited" in the title
      const explicitResult = searched.find(result =>
        /explicit|uncensored|unedited|parental advisory/i.test(result.title)
      );

      songInfo = explicitResult || searched[0];
      url = songInfo.url || `https://www.youtube.com/watch?v=${songInfo.id}`;
    }

    const song = {
      title: songInfo.title,
      url: url,
      duration: songInfo.durationInSec,
      thumbnail: songInfo.thumbnails?.[0]?.url || null,
      requestedBy: interaction.user.tag,
    };

    // Get or create connection
    let connection = getVoiceConnection(interaction.guildId);
    if (!connection) {
      connection = musicQueue.createConnection(voiceChannel);
      musicQueue.setupPlayer(interaction.guildId, connection);
    }

    await musicQueue.addSong(interaction.guildId, song);

    const queueList = musicQueue.getQueueList(interaction.guildId);
    if (queueList.length === 1) {
      return interaction.editReply(`Now playing: **${song.title}**`);
    } else {
      return interaction.editReply(`Added to queue: **${song.title}** (Position: ${queueList.length})`);
    }
  } catch (error) {
    console.error('Error in play command:', error);
    return interaction.editReply('An error occurred while trying to play the song!');
  }
}
