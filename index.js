const Nodes = [{
    name: 'main',
    url: 'http://gwgo0owkc48o8ksw0s0gcsow-013421871629:2333',
    auth: 'youshallnotpass',
    secure: false
}];

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!play')) return;

    const query = message.content.split(' ').slice(1).join(' ');
    if (!query) return message.reply('❌ اكتب اسم الأغنية!');

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('⚠️ ادخل روم صوتي');

    try {
        const node = shoukaku.getNode();
        if (!node) return message.reply('❌ Lavalink غير متصل');

        const result = await node.rest.resolve(query);
        if (!result.tracks.length) return message.reply('❌ ما فيه نتائج');

        const track = result.tracks[0];

        let player = shoukaku.players.get(message.guildId);

        if (!player) {
            player = await node.joinChannel({
                guildId: message.guildId,
                channelId: voiceChannel.id,
                shardId: message.guild.shardId,
                deaf: true
            });
        }

        await player.playTrack({ track: track.encoded });

        message.reply(`🎶 تشغيل: ${track.info.title}`);

    } catch (err) {
        console.error(err);
        message.reply('❌ صار خطأ');
    }
});
