import { Client, Collection, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config } from './config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import play from 'play-dl';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize play-dl with YouTube
await play.getFreeClientID().then((clientID) => play.setToken({
  youtube: {
    cookie: ''
  }
}));

// Initialize Spotify if credentials are provided
if (config.spotify.clientId && config.spotify.clientSecret &&
    config.spotify.clientId !== 'your_spotify_client_id_here') {
  try {
    // Authorize with Spotify using client credentials
    await play.authorization();
    await play.setToken({
      spotify: {
        client_id: config.spotify.clientId,
        client_secret: config.spotify.clientSecret,
        market: 'US'
      }
    });
    console.log('Spotify authentication initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize Spotify authentication:', error.message);
    console.warn('Spotify links will not work. Please check your credentials in .env file');
  }
} else {
  console.warn('Spotify credentials not found. Spotify links will not work.');
  console.warn('Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env file to enable Spotify support.');
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

// Setup commands collection
client.commands = new Collection();

// Load commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
    console.log(`Loaded command: ${command.data.name}`);
  } else {
    console.warn(`Warning: Command at ${filePath} is missing required "data" or "execute" property.`);
  }
}

// Register slash commands
const rest = new REST().setToken(config.token);

try {
  console.log(`Started refreshing ${commands.length} application (/) commands.`);

  const data = await rest.put(
    Routes.applicationCommands(config.clientId),
    { body: commands },
  );

  console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
  console.error('Error registering commands:', error);
}

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const reply = { content: 'There was an error while executing this command!', ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Bot ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Bot is ready and serving ${client.guilds.cache.size} servers!`);
});

// Login to Discord
client.login(config.token);
