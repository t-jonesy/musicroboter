import { SlashCommandBuilder } from 'discord.js';
import { musicQueue } from '../utils/queue.js';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the current song');

export async function execute(interaction) {
  const member = interaction.member;
  const voiceChannel = member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply('You need to be in a voice channel to use this command!');
  }

  const currentSong = musicQueue.getCurrentSong(interaction.guildId);
  if (!currentSong) {
    return interaction.reply('There is no song currently playing!');
  }

  musicQueue.skip(interaction.guildId);
  return interaction.reply('Skipped the current song!');
}
