import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { musicQueue } from '../utils/queue.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Show the current music queue');

export async function execute(interaction) {
  const queueList = musicQueue.getQueueList(interaction.guildId);
  const currentSong = musicQueue.getCurrentSong(interaction.guildId);
  const autoplayEnabled = musicQueue.getAutoplayState(interaction.guildId);

  if (!currentSong && queueList.length === 0) {
    const autoplayStatus = autoplayEnabled ? '\n🎵 Autoplay is enabled - play a song to start!' : '';
    return interaction.reply(`The queue is empty!${autoplayStatus}`);
  }

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Music Queue')
    .setTimestamp();

  if (currentSong) {
    const songType = currentSong.isUserRequested === false ? ' 🎵 (Autoplay)' : '';
    embed.addFields({
      name: 'Now Playing',
      value: `**${currentSong.title}**${songType}\nRequested by: ${currentSong.requestedBy}`,
    });
  }

  if (queueList.length > 1) {
    const upNext = queueList
      .slice(1, 11)
      .map((song, index) => {
        const songType = song.isUserRequested === false ? ' 🎵' : '';
        return `${index + 1}. **${song.title}**${songType}`;
      })
      .join('\n');

    embed.addFields({
      name: `Up Next (${queueList.length - 1} songs)`,
      value: upNext,
    });

    if (queueList.length > 11) {
      embed.setFooter({ text: `And ${queueList.length - 11} more...` });
    }
  }

  // Add autoplay status
  if (autoplayEnabled) {
    embed.setDescription('🎵 Autoplay is enabled');
  }

  return interaction.reply({ embeds: [embed] });
}
