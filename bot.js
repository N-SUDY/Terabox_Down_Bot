const fs = require('fs');
const path = require('path');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Load environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const DUMP_CHANNEL_ID = process.env.DUMP_CHANNEL_ID;

// Initialize the bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('Bot Connected');

// Function to format the progress bar
function formatProgressBar(filename, percentage, done, totalSize, status, speed, userMention, userId) {
    const barLength = 10;
    const filledLength = Math.floor(barLength * percentage / 100);
    const bar = '★'.repeat(filledLength) + '☆'.repeat(barLength - filledLength);

    function formatSize(size) {
        if (size < 1024) {
            return `${size} B`;
        } else if (size < 1024 ** 2) {
            return `${(size / 1024).toFixed(2)} KB`;
        } else if (size < 1024 ** 3) {
            return `${(size / 1024 ** 2).toFixed(2)} MB`;
        } else {
            return `${(size / 1024 ** 3).toFixed(2)} GB`;
        }
    }

    return `
┏ ғɪʟᴇɴᴀᴍᴇ: ${filename}
┠ [${bar}] ${percentage.toFixed(2)}%
┠ ᴘʀᴏᴄᴇssᴇᴅ: ${formatSize(done)} ᴏғ ${formatSize(totalSize)}
┠ sᴛᴀᴛᴜs: ${status}
┠ sᴘᴇᴇᴅ: ${formatSize(speed)}/s
┖ ᴜsᴇʀ: ${userMention} | ɪᴅ: ${userId}`;
}

// Function to download video
async function downloadVideo(url, chatId, messageId, userMention, userId) {
    try {
        const response = await axios.get(`https://teraboxvideodownloader.nepcoderdevs.workers.dev/?url=${url}`);
        const data = response.data;

        if (!data.response || data.response.length === 0) {
            throw new Error('No response data found');
        }

        const resolutions = data.response[0].resolutions;
        const fastDownloadLink = resolutions['Fast Download'];
        const videoTitle = data.response[0].title.replace(/[<>:"/\\|?*]+/g, '');
        const videoPath = path.join(videosDir, `${videoTitle}.mp4`);

        const videoResponse = await axios({
            url: fastDownloadLink,
            method: 'GET',
            responseType: 'stream'
        });

        const totalLength = parseInt(videoResponse.headers['content-length']);
        let downloadedLength = 0;
        const startTime = Date.now();
        let lastPercentageUpdate = 0;

        const writer = fs.createWriteStream(videoPath);
        videoResponse.data.on('data', chunk => {
            downloadedLength += chunk.length;
            writer.write(chunk);

            const elapsedTime = (Date.now() - startTime) / 1000;
            const percentage = (downloadedLength / totalLength) * 100;
            const speed = downloadedLength / elapsedTime;

            if (percentage - lastPercentageUpdate >= 7) {
                const progress = formatProgressBar(
                    videoTitle,
                    percentage,
                    downloadedLength,
                    totalLength,
                    'Downloading',
                    speed,
                    userMention,
                    userId
                );
                bot.editMessageText(progress, { chat_id: chatId, message_id: messageId });
                lastPercentageUpdate = percentage;
            }
        });

        await new Promise((resolve, reject) => {
            videoResponse.data.on('end', () => {
                writer.end();
                resolve();
            });
            videoResponse.data.on('error', reject);
        });

        return { videoPath, videoTitle, totalLength };

    } catch (error) {
        throw new Error(`Download failed: ${error.message}`);
    }
}

// Handle the /start command
bot.onText(/\/start/, (msg) => {
    const user = msg.from;
    const inlineKeyboard = {
        inline_keyboard: [[{ text: "ᴅᴇᴠᴇʟᴏᴘᴇʀ ⚡️", url: "tg://user?id=1008848605" }]]
    };

    bot.sendMessage(
        msg.chat.id,
        `ᴡᴇʟᴄᴏᴍᴇ, <a href='tg://user?id=${user.id}'>${user.first_name}</a>.\n\n` +
        "🌟 ɪ ᴀᴍ ᴀ ᴛᴇʀᴀʙᴏx ᴅᴏᴡɴʟᴏᴀᴅᴇʀ ʙᴏᴛ.\n" +
        "sᴇɴᴅ ᴍᴇ ᴀɴʏ ᴛᴇʀᴀʙᴏx ʟɪɴᴋ ɪ ᴡɪʟʟ ᴅᴏᴡɴʟᴏᴀᴅ ᴡɪᴛʜɪɴ ғᴇᴡ sᴇᴄᴏɴᴅs\n" +
        "ᴀɴᴅ sᴇɴᴅ ɪᴛ ᴛᴏ ʏᴏᴜ ✨",
        { parse_mode: 'HTML', reply_markup: inlineKeyboard }
    );
});

// Handle messages containing Terabox URLs
bot.on('message', async (msg) => {
    const videoUrl = msg.text;
    const chatId = msg.chat.id;
    const user = msg.from;
    const userMention = `<a href='tg://user?id=${user.id}'>${user.first_name}</a>`;
    const userId = user.id;

    if (/http[s]?:\/\/.*tera/.test(videoUrl)) {
        const downloadMsg = await bot.sendMessage(chatId, 'ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ʏᴏᴜʀ ᴠɪᴅᴇᴏ...');

        try {
            const { videoPath, videoTitle, totalLength } = await downloadVideo(videoUrl, chatId, downloadMsg.message_id, userMention, userId);
            const videoSizeMb = totalLength / (1024 * 1024);

            await bot.sendVideo(DUMP_CHANNEL_ID, videoPath, {
                caption: `✨ ${videoTitle}\n📀 ${videoSizeMb.toFixed(2)} MB\n👤 ʟᴇᴇᴄʜᴇᴅ ʙʏ : ${userMention}\n📥 ᴜsᴇʀ ʟɪɴᴋ: tg://user?id=${userId}`,
                parse_mode: 'HTML'
            });

            await bot.sendVideo(chatId, videoPath, {
                caption: `✨ ${videoTitle}\n👤 ʟᴇᴇᴄʜᴇᴅ ʙʏ : ${userMention}\n📥 ᴜsᴇʀ ʟɪɴᴋ: tg://user?id=${userId}`,
                parse_mode: 'HTML'
            });

            await bot.sendSticker(chatId, "CAACAgIAAxkBAAEZdwRmJhCNfFRnXwR_lVKU1L9F3qzbtAAC4gUAAj-VzApzZV-v3phk4DQE");
            await bot.deleteMessage(chatId, downloadMsg.message_id);
            await bot.deleteMessage(chatId, msg.message_id);

            fs.unlinkSync(videoPath);
        } catch (error) {
            await bot.editMessageText(`Download failed: ${error.message}`, { chat_id: chatId, message_id: downloadMsg.message_id });
        }
    } else {
        await bot.sendMessage(chatId, 'ᴘʟᴇᴀsᴇ sᴇɴᴅ ᴀ ᴠᴀʟɪᴅ ᴛᴇʀᴀʙᴏx ʟɪɴᴋ.');
    }
});

// Health check endpoint
const app = express();
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
