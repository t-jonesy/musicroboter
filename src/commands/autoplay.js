import { SlashCommandBuilder } from 'discord.js';
import { musicQueue } from '../utils/queue.js';

export const data = new SlashCommandBuilder()
  .setName('autoplay')
  .setDescription('Toggle autoplay for related songs when the queue is empty');

export async function execute(interaction) {
  try {
    const guildId = interaction.guild.id;
    const newState = musicQueue.toggleAutoplay(guildId);

    if (newState) {
      await interaction.reply({
        content: '✅ Autoplay enabled! I\'ll automatically queue related songs when the queue is empty.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ Autoplay disabled! Music will stop when the queue is empty.',
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error('Error in autoplay command:', error);
    await interaction.reply({
      content: 'An error occurred while toggling autoplay.',
      ephemeral: true,
    });
  }
}
