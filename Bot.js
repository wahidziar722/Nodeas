const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const BOT_TOKEN = '8434128207:AAH-BnEeeW1pR2X2n1OjrUs2NtWJGPh8Qs8';
const BOT_CREATOR = '@Kingwahidafg';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();
const PORT = process.env.PORT || 8080;

const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

const userLang = new Map();

const texts = {
    english: {
        start: '🎬 *Video Downloader*\n\nSend me any video link from:\n📌 YouTube\n📌 TikTok\n📌 Facebook\n📌 Instagram\n\n⚡ Just send the link!',
        downloading: '⏬ *Downloading...*',
        uploading: '📤 *Uploading...*',
        success: '✅ *Downloaded successfully!*',
        failed: '❌ *Download failed!*\nContact @Kingwahidafg',
        large: '❌ *File too large!* (max 50MB)',
        noUrl: '❌ *No valid link found!*',
        choose: '🌐 *Choose language:*',
        langSet: '✅ Language set to English!'
    },
    pashto: {
        start: '🎬 *ویډیو ډاونلوډر*\n\nما ته د ویډیو لینک رالیږئ:\n📌 یوټیوب\n📌 تیک تاک\n📌 فیسبوک\n📌 انسټاګرام',
        downloading: '⏬ *ډاونلوډ کوم...*',
        uploading: '📤 *اپلوډ کوم...*',
        success: '✅ *ډاونلوډ شو!*',
        failed: '❌ *ناکام شو!*\nاړیکه @Kingwahidafg',
        large: '❌ *فایل لوی دی!* (حد 50MB)',
        noUrl: '❌ *لینک ونه موندل شو!*',
        choose: '🌐 *ژبه غوره کړئ:*',
        langSet: '✅ ژبه پښتو ته بدله شوه!'
    },
    farsi: {
        start: '🎬 *دانلودر ویدیو*\n\nلینک ویدیو را بفرستید:\n📌 یوتیوب\n📌 تیک‌تاک\n📌 فیسبوک\n📌 اینستاگرام',
        downloading: '⏬ *در حال دانلود...*',
        uploading: '📤 *در حال آپلود...*',
        success: '✅ *دانلود شد!*',
        failed: '❌ *ناموفق!*\nتماس @Kingwahidafg',
        large: '❌ *فایل بزرگ است!* (حداکثر 50MB)',
        noUrl: '❌ *لینک معتبر یافت نشد!*',
        choose: '🌐 *زبان را انتخاب کنید:*',
        langSet: '✅ زبان به فارسی تغییر کرد!'
    }
};

function getText(userId, key) {
    const lang = userLang.get(userId) || 'english';
    return texts[lang][key] || texts.english[key];
}

async function downloadVideo(url) {
    return new Promise(async (resolve, reject) => {
        const timestamp = Date.now();
        const outputPath = path.join(downloadsDir, `video_${timestamp}.mp4`);
        
        try {
            const command = `yt-dlp -f "best[height<=480]" -o "${outputPath}" "${url}"`;
            await execPromise(command, { timeout: 120000 });
            
            if (await fs.pathExists(outputPath)) {
                const stats = await fs.stat(outputPath);
                const sizeMB = stats.size / (1024 * 1024);
                
                if (sizeMB > 50) {
                    await fs.remove(outputPath);
                    reject(new Error('FILE_TOO_LARGE'));
                    return;
                }
                resolve(outputPath);
            } else {
                reject(new Error('FILE_NOT_FOUND'));
            }
        } catch (error) {
            reject(new Error('DOWNLOAD_FAILED'));
        }
    });
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
        inline_keyboard: [
            [
                { text: '🇬🇧 English', callback_data: 'lang_english' },
                { text: '🇦🇫 پښتو', callback_data: 'lang_pashto' },
                { text: '🇮🇷 فارسی', callback_data: 'lang_farsi' }
            ]
        ]
    };
    bot.sendMessage(chatId, getText(chatId, 'choose'), { reply_markup: keyboard });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (data.startsWith('lang_')) {
        const lang = data.split('_')[1];
        userLang.set(chatId, lang);
        
        await bot.editMessageText(getText(chatId, 'langSet'), {
            chat_id: chatId,
            message_id: query.message.message_id
        });
        
        bot.sendMessage(chatId, getText(chatId, 'start'), { parse_mode: 'Markdown' });
        bot.answerCallbackQuery(query.id);
    }
});

bot.onText(/https?:\/\/[^\s]+/, async (msg, match) => {
    const chatId = msg.chat.id;
    const url = match[0];
    
    if (!userLang.has(chatId)) {
        bot.sendMessage(chatId, '❌ Send /start first');
        return;
    }
    
    const statusMsg = await bot.sendMessage(chatId, getText(chatId, 'downloading'));
    
    try {
        const videoPath = await downloadVideo(url);
        await bot.editMessageText(getText(chatId, 'uploading'), {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });
        
        await bot.sendVideo(chatId, fs.createReadStream(videoPath), {
            caption: getText(chatId, 'success')
        });
        
        await bot.deleteMessage(chatId, statusMsg.message_id);
        await fs.remove(videoPath);
    } catch (error) {
        let errorMsg = getText(chatId, 'failed');
        if (error.message === 'FILE_TOO_LARGE') errorMsg = getText(chatId, 'large');
        await bot.editMessageText(errorMsg, {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/') || text.match(/https?:\/\/[^\s]+/)) return;
    bot.sendMessage(chatId, getText(chatId, 'noUrl'));
});

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(PORT, () => {
    console.log('Bot started...');
});

console.log('WAHIDX VIDEO DOWNLOADER is running!');
