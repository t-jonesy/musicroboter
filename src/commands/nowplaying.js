import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { musicQueue } from '../utils/queue.js';

export const data = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('Show the currently playing song');

export async function execute(interaction) {
  const currentSong = musicQueue.getCurrentSong(interaction.guildId);

  if (!currentSong) {
    return interaction.reply('There is no song currently playing!');
  }

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Now Playing')
    .setDescription(`**${currentSong.title}**`)
    .setTimestamp();

  // Add duration if available
  if (currentSong.duration) {
    embed.addFields({
      name: 'Duration',
      value: `${Math.floor(currentSong.duration / 60)}:${(currentSong.duration % 60).toString().padStart(2, '0')}`,
      inline: true
    });
  }

  // Add requester info if available
  if (currentSong.requestedBy) {
    embed.addFields({
      name: 'Requested by',
      value: currentSong.requestedBy,
      inline: true
    });
  } else if (currentSong.isUserRequested === false) {
    embed.addFields({
      name: 'Source',
      value: '🎵 Autoplay',
      inline: true
    });
  }

  if (currentSong.thumbnail) {
    embed.setThumbnail(currentSong.thumbnail);
  }

  return interaction.reply({ embeds: [embed] });
}
