const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { Kazagumo, Plugins } = require('kazagumo');
const { Connectors } = require('shoukaku');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// إعداد Kazagumo (wrapper فوق Shoukaku)
const kazagumo = new Kazagumo({
  defaultSearchEngine: 'youtube',
  send: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  }
}, new Connectors.DiscordJS(client), [
  {
    name: 'main',
    url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT}`,
    auth: process.env.LAVALINK_PASSWORD,
    secure: false
  }
]);

// أحداث Lavalink
kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink ${name} جاهز`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lavalink ${name}:`, error));

kazagumo.on('playerEnd', (player) => {
  const channel = client.channels.cache.get(player.textId);
  if (channel) channel.send('✅ انتهت القائمة');
});

kazagumo.on('playerEmpty', (player) => {
  player.destroy();
});

// تسجيل الـ Slash Commands
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('play').setDescription('شغّل أغنية').addStringOption(o =>
      o.setName('query').setDescription('اسم الأغنية أو رابطها').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('تخطي الأغنية الحالية'),
    new SlashCommandBuilder().setName('stop').setDescription('إيقاف الموسيقى والخروج'),
    new SlashCommandBuilder().setName('queue').setDescription('عرض قائمة الانتظار'),
    new SlashCommandBuilder().setName('pause').setDescription('إيقاف مؤقت'),
    new SlashCommandBuilder().setName('resume').setDescription('استئناف التشغيل'),
    new SlashCommandBuilder().setName('volume').setDescription('تغيير الصوت').addIntegerOption(o =>
      o.setName('level').setDescription('0-100').setRequired(true).setMinValue(0).setMaxValue(100)),
    new SlashCommandBuilder().setName('nowplaying').setDescription('ما يشتغل الآن'),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('✅ تم تسجيل الأوامر');
}

// معالجة الأوامر
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, member, channel } = interaction;

  // التحقق من وجود المستخدم في قناة صوتية
  const voiceChannel = member.voice?.channel;

  if (commandName === 'play') {
    if (!voiceChannel) return interaction.reply({ content: '🔇 ادخل قناة صوتية أول', ephemeral: true });

    await interaction.deferReply();
    const query = interaction.options.getString('query');

    try {
      const { track, type } = await kazagumo.search(query, { requester: member.user });

      if (!track?.length) return interaction.editReply('❌ ما لقيت شيء');

      let player = kazagumo.players.get(guildId);
      if (!player) {
        player = await kazagumo.createPlayer({
          guildId,
          textId: channel.id,
          voiceId: voiceChannel.id,
          volume: 80,
          deaf: true
        });
      }

      const tracks = type === 'PLAYLIST' ? track : [track[0]];
      player.queue.add(tracks);

      if (!player.playing && !player.paused) player.play();

      const msg = type === 'PLAYLIST'
        ? `📋 أضفت playlist: **${tracks.length}** أغنية`
        : `🎵 أضفت: **${tracks[0].title}**`;

      return interaction.editReply(msg);
    } catch (e) {
      console.error(e);
      return interaction.editReply('❌ صار خطأ');
    }
  }

  const player = kazagumo.players.get(guildId);
  if (!player) return interaction.reply({ content: '❌ ما في موسيقى شغالة', ephemeral: true });

  if (commandName === 'skip') {
    player.skip();
    return interaction.reply('⏭ تم التخطي');
  }

  if (commandName === 'stop') {
    player.destroy();
    return interaction.reply('⏹ تم الإيقاف');
  }

  if (commandName === 'pause') {
    player.pause(true);
    return interaction.reply('⏸ إيقاف مؤقت');
  }

  if (commandName === 'resume') {
    player.pause(false);
    return interaction.reply('▶️ استئناف');
  }

  if (commandName === 'volume') {
    const level = interaction.options.getInteger('level');
    player.setVolume(level);
    return interaction.reply(`🔊 الصوت: ${level}%`);
  }

  if (commandName === 'nowplaying') {
    const current = player.queue.current;
    if (!current) return interaction.reply('❌ ما في شيء يشتغل');
    return interaction.reply(`🎵 **${current.title}** - ${current.requester.tag}`);
  }

  if (commandName === 'queue') {
    const q = player.queue;
    if (!q.length) return interaction.reply('📋 القائمة فاضية');
    const list = q.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
    return interaction.reply(`📋 **قائمة الانتظار:**\n${list}${q.length > 10 ? `\n...و ${q.length - 10} أغاني ثانية` : ''}`);
  }
});

client.once('ready', async () => {
  console.log(`🤖 ${client.user.tag} شغال`);
  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);