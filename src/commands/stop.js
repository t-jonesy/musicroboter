import { SlashCommandBuilder } from 'discord.js';
import { musicQueue } from '../utils/queue.js';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playing music and clear the queue');

export async function execute(interaction) {
  const member = interaction.member;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply('You need to be in a voice channel to use this command!');
  }

  musicQueue.stop(interaction.guildId);
  return interaction.reply('Stopped playing music and cleared the queue!');
}
