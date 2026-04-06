const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { Kazagumo } = require('kazagumo');
const { Connectors } = require('shoukaku');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

// إعداد Kazagumo مع دعم Lavalink v4
const kazagumo = new Kazagumo({
  defaultSearchEngine: 'youtube', // المحرك الافتراضي للبحث
  send: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  }
}, new Connectors.DiscordJS(client), [
  {
    name: 'main',
    // تأكد أن الرابط يبدأ بـ http:// في متغيرات البيئة إذا لم تستخدم Secure
    url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT}`,
    auth: process.env.LAVALINK_PASSWORD,
    secure: false,
    retryAmount: 5,
    retryDelay: 3000
  }
]);

// أحداث Lavalink للتأكد من حالة الاتصال
kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink [${name}] متصل وجاهز للعمل`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ خطأ في Lavalink [${name}]:`, error));

kazagumo.on('playerEnd', (player) => {
  const channel = client.channels.cache.get(player.textId);
  if (channel) channel.send('✅ انتهت القائمة الحالية.');
});

kazagumo.on('playerEmpty', (player) => {
  const channel = client.channels.cache.get(player.textId);
  if (channel) channel.send('📋 القائمة فارغة، سأغادر القناة الصوتية.');
  player.destroy();
});

// تسجيل الـ Slash Commands
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('play').setDescription('تشغيل أغنية من يوتيوب أو ساوند كلاود').addStringOption(o =>
      o.setName('query').setDescription('اسم الأغنية أو الرابط').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('تخطي الأغنية الحالية'),
    new SlashCommandBuilder().setName('stop').setDescription('إيقاف الموسيقى ومغادرة القناة'),
    new SlashCommandBuilder().setName('queue').setDescription('عرض قائمة الانتظار'),
    new SlashCommandBuilder().setName('pause').setDescription('إيقاف التشغيل مؤقتاً'),
    new SlashCommandBuilder().setName('resume').setDescription('استئناف التشغيل'),
    new SlashCommandBuilder().setName('volume').setDescription('تعديل مستوى الصوت').addIntegerOption(o =>
      o.setName('level').setDescription('من 0 إلى 100').setRequired(true).setMinValue(0).setMaxValue(100)),
    new SlashCommandBuilder().setName('nowplaying').setDescription('عرض الأغنية التي تعمل حالياً'),
  ].map(c => c.toJSON());

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ تم تحديث أوامر الـ Slash بنجاح');
  } catch (error) {
    console.error('❌ فشل تسجيل الأوامر:', error);
  }
}

// معالجة التفاعلات (Interactions)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId, member, channel } = interaction;
  const voiceChannel = member.voice?.channel;

  // أمر التشغيل
  if (commandName === 'play') {
    if (!voiceChannel) return interaction.reply({ content: '🔇 يجب أن تكون في قناة صوتية أولاً!', ephemeral: true });

    await interaction.deferReply();
    const query = interaction.options.getString('query');

    try {
      const result = await kazagumo.search(query, { requester: member.user });

      if (!result.track || !result.track.length) {
        return interaction.editReply('❌ لم يتم العثور على نتائج. تأكد من تفعيل YouTube Plugin في Lavalink.');
      }

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

      if (result.type === 'PLAYLIST') {
        player.queue.add(result.track);
        if (!player.playing && !player.paused) player.play();
        return interaction.editReply(`📋 تم إضافة القائمة: **${result.track.length}** أغنية.`);
      } else {
        player.queue.add(result.track[0]);
        if (!player.playing && !player.paused) player.play();
        return interaction.editReply(`🎵 تم إضافة: **${result.track[0].title}**`);
      }
    } catch (e) {
      console.error(e);
      return interaction.editReply('❌ حدث خطأ أثناء محاولة تشغيل المقطع.');
    }
  }

  // التحقق من وجود مشغل صوتي لباقي الأوامر
  const player = kazagumo.players.get(guildId);
  if (!player) return interaction.reply({ content: '❌ لا توجد موسيقى تعمل حالياً في هذا السيرفر.', ephemeral: true });

  if (commandName === 'skip') {
    player.skip();
    return interaction.reply('⏭ تم التخطي!');
  }

  if (commandName === 'stop') {
    player.destroy();
    return interaction.reply('⏹ تم إيقاف التشغيل ومغادرة القناة.');
  }

  if (commandName === 'pause') {
    player.pause(true);
    return interaction.reply('⏸ تم الإيقاف المؤقت.');
  }

  if (commandName === 'resume') {
    player.pause(false);
    return interaction.reply('▶️ تم استئناف التشغيل.');
  }

  if (commandName === 'volume') {
    const level = interaction.options.getInteger('level');
    player.setVolume(level);
    return interaction.reply(`🔊 مستوى الصوت الجديد: ${level}%`);
  }

  if (commandName === 'nowplaying') {
    const current = player.queue.current;
    if (!current) return interaction.reply('❌ لا يوجد شيء يعمل حالياً.');
    return interaction.reply(`🎶 **يعمل الآن:** ${current.title}`);
  }

  if (commandName === 'queue') {
    const q = player.queue;
    if (!q.length) return interaction.reply('📋 قائمة الانتظار فارغة.');
    const list = q.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
    return interaction.reply(`📋 **أول 10 أغاني في القائمة:**\n${list}${q.length > 10 ? `\n...و ${q.length - 10} أغاني إضافية.` : ''}`);
  }
});

client.once('ready', async () => {
  console.log(`🤖 سجل البوت دخوله باسم: ${client.user.tag}`);
  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
