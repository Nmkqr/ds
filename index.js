const { Client, GatewayIntentBits } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');

// --- الإعدادات ---
// ملاحظة: نستخدم process.env لجلب التوكن من Environment Variables في Coolify للأمان
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 

const Nodes = [{
    name: 'main',
    // استخدمنا الاسم الداخلي لـ Lavalink في Coolify
    url: 'lavalink', 
    auth: 'youshallnotpass', 
    secure: false
}];

// --- إنشاء العميل (Client) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// --- إعداد Shoukaku للموسيقى ---
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes);

// معالج الأخطاء (ضروري جداً لمنع انهيار البوت في حال فصل السيرفر)
shoukaku.on('error', (name, error) => {
    console.error(`[Lavalink] خطأ في سيرفر ${name}:`, error);
});

// عند تشغيل البوت بنجاح
client.on('clientReady', (c) => {
    console.log(`✅ البوت شغال وجاهز: ${c.user.tag}`);
});

// --- أمر التشغيل الرئيسي ---
client.on('messageCreate', async (message) => {
    // تجاهل رسائل البوتات أو الرسائل التي لا تبدأ بـ !play
    if (message.author.bot || !message.content.startsWith('!play')) return;

    const args = message.content.split(' ');
    const query = args.slice(1).join(' ');

    if (!query) return message.reply('❌ اكتب اسم الأغنية أو الرابط بعد الأمر!');

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('⚠️ لازم تكون في روم صوتي أولاً!');

    try {
        // جلب سيرفر Lavalink المتصل
        const node = shoukaku.options.nodeResolver(shoukaku.nodes);
        if (!node) return message.reply('💢 سيرفر الموسيقى غير متصل حالياً!');

        // البحث عن التراك (Track)
        const result = await node.rest.resolve(query);
        if (!result?.tracks?.length) return message.reply('🔍 ما حصلت نتائج للبحث.');

        const track = result.tracks[0];

        // جلب أو إنشاء المشغل (Player) في السيرفر
        let player = shoukaku.players.get(message.guildId);

        if (!player) {
            player = await node.joinChannel({
                guildId: message.guildId,
                channelId: voiceChannel.id,
                shardId: 0,
                deaf: true
            });
        }

        // تشغيل الملف الصوتي
        await player.playTrack({ track: track.encoded });
        message.reply(`🎶 جاري تشغيل: **${track.info.title}**`);

    } catch (err) {
        console.error("خطأ أثناء التشغيل:", err);
        message.reply('❌ حدث خطأ تقني أثناء محاولة تشغيل الأغنية.');
    }
});

// تسجيل الدخول
client.login(DISCORD_TOKEN);
