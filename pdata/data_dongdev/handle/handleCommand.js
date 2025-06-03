module.exports = function ({ api, models, Users, Threads, Currencies }) {
    // === Require các thư viện cần thiết ===
    const stringSimilarity = require('string-similarity');
    const logger = require("../../utils/log.js");
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    const moment = require("moment-timezone");

    // === Hàm escape Regex cho prefix ===
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // === Hàm chuyển bytes sang MB/GB... ===
    function byte2mb(bytes) {
        const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        let l = 0, n = parseInt(bytes, 10) || 0;
        while (n >= 1024 && ++l) n /= 1024;
        return `${n.toFixed(n < 10 && l > 0 ? 1 : 0)} ${units[l]}`;
    }

    // === Hàm lấy thời gian uptime ===
    function getUptimeString() {
        const tm = process.uptime() + (global.config.UPTIME || 0);
        const h = Math.floor(tm / 3600);
        const m = Math.floor((tm % 3600) / 60);
        const s = Math.floor(tm % 60);
        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    // === Hàm lấy ngày giờ đẹp ===
    function getTimeVN() {
        return moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss || DD/MM/YYYY");
    }

    // === Hàm lấy tên quyền hạn ===
    function getPermissionName(num) {
        switch (num) {
            case 1: return "Quản Trị Viên";
            case 2: return "Admin Bot";
            case 3: return "Người Điều Hành";
            default: return "Thành viên";
        }
    }

    // === Hàm gửi message và tự gỡ sau delay ===
    async function sendTempMessage(api, msg, threadID, delay = 15, attachment = null, replyMsgID = null) {
        api.sendMessage({ body: msg, attachment }, threadID, async (err, info) => {
            await new Promise(r => setTimeout(r, delay * 1000));
            if (info) api.unsendMessage(info.messageID);
        }, replyMsgID);
    }

    // === Hàm chính xử lý command ===
    return async function ({ event }) {
        const { allowInbox, PREFIX, ADMINBOT, NDH, DeveloperMode } = global.config;
        const { userBanned, threadBanned, threadInfo, threadData, commandBanned } = global.data;
        const { commands, cooldowns } = global.client;

        let { body, senderID, threadID, messageID } = event;
        senderID = String(senderID);
        threadID = String(threadID);

        // === Bỏ qua tin nhắn của bot ===
        if (senderID === api.getCurrentUserID()) return;

        // === Lấy prefix theo box hoặc mặc định ===
        const threadSetting = threadData.get(threadID) || {};
        const prefixBox = threadSetting.PREFIX || PREFIX;
        const prefixRegex = new RegExp(`^(<@!?${senderID}>|${escapeRegex(prefixBox)})\\s*`);

        // === Chỉ Admin mới dùng nếu cấu hình adminOnly ===
        const configData = require('../../../config.json');
        if (typeof body === 'string' && body.startsWith(prefixBox)) {
            if (!ADMINBOT.includes(senderID) && configData.adminOnly === true) {
                return sendTempMessage(api, `🔒 [ADMIN ONLY]\nChỉ admin bot mới có thể sử dụng bot này!`, threadID, 12, null, messageID);
            }
            if (!ADMINBOT.includes(senderID) && configData.adminPaseOnly === true) {
                return sendTempMessage(api, `🔒 [ADMIN PASE ONLY]\nChỉ admin bot được dùng bot ở chat riêng!`, threadID, 12, null, messageID);
            }
            if (!ADMINBOT.includes(senderID) && configData.ndhOnly === true) {
                return sendTempMessage(api, `🔒 [NDH ONLY]\nChỉ người hỗ trợ bot mới có thể sử dụng bot này!`, threadID, 12, null, messageID);
            }
        }

        // === Giới hạn cho QTV box nếu cài đặt ===
        const dataAdbox = require('../../../modules/commands/data/dataAdbox.json');
        const threadInf = threadInfo.get(threadID) || await Threads.getInfo(threadID);
        const isAdminBox = threadInf.adminIDs.some(el => el.id == senderID);

        if (typeof body === 'string' && body.startsWith(prefixBox)
            && dataAdbox.adminbox?.[threadID]
            && !ADMINBOT.includes(senderID)
            && !isAdminBox
            && event.isGroup === true
        ) {
            return sendTempMessage(api, `🔒 [QTV ONLY]\nChỉ Quản Trị Viên nhóm mới có thể sử dụng bot này!`, threadID, 12, null, messageID);
        }

        // === Chặn user/box bị ban hoặc không cho inbox ===
        if (
            userBanned.has(senderID) ||
            threadBanned.has(threadID) ||
            (allowInbox === false && senderID === threadID)
        ) {
            if (!body.startsWith(PREFIX)) return;
            if (!ADMINBOT.includes(senderID)) {
                if (userBanned.has(senderID)) {
                    const { reason, dateAdded } = userBanned.get(senderID) || {};
                    return sendTempMessage(api, global.getText("handleCommand", "userBanned", reason, dateAdded), threadID, 15, null, messageID);
                }
                if (threadBanned.has(threadID)) {
                    const { reason, dateAdded } = threadBanned.get(threadID) || {};
                    return sendTempMessage(api, global.getText("handleCommand", "threadBanned", reason, dateAdded), threadID, 15, null, messageID);
                }
            }
            return;
        }

        // === Parse lệnh ===
        if (!body) body = '';
        const [matchedPrefix] = body.match(prefixRegex) || [''];
        let args = body.slice(matchedPrefix.length).trim().split(/ +/);
        let commandName = args.shift()?.toLowerCase() || '';
        let command = commands.get(commandName);

        // === Xử lý lệnh không dùng prefix ===
        if (!prefixRegex.test(body)) {
            args = (body || '').trim().split(/ +/);
            commandName = args.shift()?.toLowerCase();
            command = commands.get(commandName);
            if (command && command.config) {
                if (command.config.usePrefix === false && commandName !== command.config.name) {
                    return sendTempMessage(api, `❌ Bạn nhập sai tên lệnh!\n👉 Lệnh đúng: ${command.config.name}`, threadID, 10, null, messageID);
                }
                if (command.config.usePrefix === true && !body.startsWith(PREFIX)) {
                    return;
                }
            }
            if (command && typeof command.config.usePrefix === 'undefined') return;
        }

        // === Nếu không có lệnh, gợi ý command gần đúng + lệnh mới nhất ===
        if (!command) {
            if (!body.startsWith(prefixBox)) return;
            const allCommandNames = Array.from(commands.keys());
            const userName = await Users.getNameUser(senderID);
            const folderPath = './modules/commands';
            fs.readdir(folderPath, (err, files) => {
                if (err) return console.error('Lỗi đọc thư mục:', err);
                const allFiles = files
                    .filter(file => fs.statSync(path.join(folderPath, file)).isFile())
                    .map(file => ({
                        name: file,
                        time: fs.statSync(path.join(folderPath, file)).mtime.getTime(),
                    }));
                const latestFile = allFiles.sort((a, b) => b.time - a.time)[0];
                const checker = stringSimilarity.findBestMatch(commandName, allCommandNames);
                const suggest = checker.bestMatch.rating >= 0.5 ? checker.bestMatch.target : null;
                const msg = [
                    `👤 Người dùng: ${userName}`,
                    `❎ Lệnh không tồn tại${suggest ? `, lệnh gần giống là: "${suggest}"` : ""}`,
                    latestFile ? `🆕 Lệnh được thêm gần đây: ${latestFile.name}` : "",
                    `───────────────`,
                    `⏰ Time: ${getTimeVN()}`
                ].filter(Boolean).join('\n');
                api.sendMessage({ body: msg, attachment: global.khanhdayr.splice(0, 1) }, threadID, async (err, info) => {
                    await new Promise(r => setTimeout(r, 15 * 1000));
                    api.unsendMessage(info.messageID);
                }, messageID);
            });
            return;
        }

        // === Kiểm tra các trường hợp bị ban/cấm lệnh cụ thể (command ban, user ban, disable...) ===
        const banPath = path.join(__dirname, '../../../modules/commands/data/commands-banned.json');
        let banData = {};
        if (fs.existsSync(banPath)) banData = JSON.parse(fs.readFileSync(banPath));
        const name = id => global.data.userName.get(id) || id;
        const isAdminBox2 = id => (threadInfo.get(threadID) || {}).adminIDs?.some($ => $.id == id);

        if (banData[threadID]) {
            // Cấm theo lệnh toàn box
            const ban = banData[threadID].cmds?.find($ => $.cmd == command.config.name);
            if (ban && ban.author != senderID) {
                const isAdmin = ADMINBOT.includes(ban.author);
                const isQTV = isAdminBox2(ban.author);
                const msg = [
                    `🚫 [LỆNH BỊ CẤM]`,
                    `🕑 Lúc: ${ban.time}`,
                    `👤 ${isAdmin ? "Admin bot" : "QTV nhóm"}: ${name(ban.author)}`,
                    `⛔ Đã cấm nhóm sử dụng lệnh: ${command.config.name}`,
                    `✏️ Liên hệ admin để được hỗ trợ`,
                    `⏳ Uptime: ${getUptimeString()}`,
                    `⏰ Time: ${getTimeVN()}`
                ].join('\n');
                return sendTempMessage(api, msg, threadID, 15, null, messageID);
            }
            // Cấm user toàn bộ hoặc user cấm lệnh
            const userBan = banData[threadID].users?.[senderID];
            if (userBan) {
                if (userBan.all?.status && userBan.all.author != senderID) {
                    const isAdmin = ADMINBOT.includes(userBan.all.author);
                    const isQTV = isAdminBox2(userBan.all.author);
                    const msg = [
                        `🚫 [BẠN BỊ BAN]`,
                        `🕑 Lúc: ${userBan.all.time}`,
                        `👤 ${isAdmin ? "Admin bot" : "QTV nhóm"}: ${name(userBan.all.author)}`,
                        `⛔ Đã cấm bạn sử dụng bot!`,
                        `✏️ Liên hệ admin để được hỗ trợ`,
                        `⏳ Uptime: ${getUptimeString()}`,
                        `⏰ Time: ${getTimeVN()}`
                    ].join('\n');
                    return sendTempMessage(api, msg, threadID, 15, null, messageID);
                }
                const banCmd = userBan.cmds?.find($ => $.cmd == command.config.name);
                if (banCmd && banCmd.author != senderID) {
                    const isAdmin = ADMINBOT.includes(banCmd.author);
                    const isQTV = isAdminBox2(banCmd.author);
                    const msg = [
                        `🚫 [BẠN BỊ CẤM LỆNH]`,
                        `🕑 Lúc: ${banCmd.time}`,
                        `👤 ${isAdmin ? "Admin bot" : "QTV nhóm"}: ${name(banCmd.author)}`,
                        `⛔ Đã cấm bạn dùng lệnh: ${command.config.name}`,
                        `✏️ Liên hệ admin để được hỗ trợ`,
                        `⏳ Uptime: ${getUptimeString()}`,
                        `⏰ Time: ${getTimeVN()}`
                    ].join('\n');
                    return sendTempMessage(api, msg, threadID, 15, null, messageID);
                }
            }
        }

        // === Disable tất cả lệnh của nhóm commandCategory ===
        const disableCmdPath = path.join(__dirname, '../../../modules/commands/data/disable-command.json');
        if (!ADMINBOT.includes(senderID) && fs.existsSync(disableCmdPath)) {
            const disableData = JSON.parse(fs.readFileSync(disableCmdPath));
            if (disableData[threadID]?.[command.config.commandCategory] === true) {
                const msg = [
                    `⚠️ [DANH MỤC ĐÃ TẮT]`,
                    `Không được phép sử dụng các lệnh thuộc nhóm "${command.config.commandCategory}"`,
                    `⏳ Uptime: ${getUptimeString()}`,
                    `⏰ Time: ${getTimeVN()}`
                ].join('\n');
                return sendTempMessage(api, msg, threadID, 15, null, messageID);
            }
        }

        // === Ban lệnh theo thread/user ===
        if ((commandBanned.get(threadID) || commandBanned.get(senderID)) && !ADMINBOT.includes(senderID)) {
            const banThreads = commandBanned.get(threadID) || [];
            const banUsers = commandBanned.get(senderID) || [];
            if (banThreads.includes(command.config.name)) {
                return sendTempMessage(api, global.getText("handleCommand", "commandThreadBanned", command.config.name), threadID, 15, null, messageID);
            }
            if (banUsers.includes(command.config.name)) {
                return sendTempMessage(api, global.getText("handleCommand", "commandUserBanned", command.config.name), threadID, 15, null, messageID);
            }
        }

        // === Chặn NSFW nếu nhóm chưa bật ===
        if (command.config.commandCategory?.toLowerCase() === 'nsfw'
            && !global.data.threadAllowNSFW.includes(threadID)
            && !ADMINBOT.includes(senderID)
        ) {
            return sendTempMessage(api, global.getText("handleCommand", "threadNotAllowNSFW"), threadID, 15, null, messageID);
        }

        // === Phân quyền ===
        let permssion = 0;
        if (NDH.includes(senderID)) permssion = 3;
        else if (ADMINBOT.includes(senderID)) permssion = 2;
        else if (isAdminBox) permssion = 1;

        if (command.config.hasPermssion > permssion) {
            const userName = await Users.getNameUser(senderID);
            const msg = [
                `🚫 [KHÔNG ĐỦ QUYỀN]`,
                `👤 Người dùng: ${userName}`,
                `📝 Lệnh "${command.config.name}" yêu cầu quyền: ${getPermissionName(command.config.hasPermssion)}`,
                `⚠️ Bạn không có quyền sử dụng lệnh này!`
            ].join('\n');
            return sendTempMessage(api, msg, threadID, 15, null, messageID);
        }

        // === Cooldown mỗi lệnh ===
        if (!cooldowns.has(command.config.name)) cooldowns.set(command.config.name, new Map());
        const timestamps = cooldowns.get(command.config.name);
        const expirationTime = (command.config.cooldowns || 1) * 1000;
        const now = Date.now();
        if (timestamps.has(senderID) && now < timestamps.get(senderID) + expirationTime) {
            const timeLeft = Math.ceil((timestamps.get(senderID) + expirationTime - now) / 1000);
            return sendTempMessage(api, `⏳ [THỜI GIAN CHỜ]\nLệnh "${command.config.name}" có thời gian chờ: ${command.config.cooldowns} giây\nVui lòng chờ ${timeLeft} giây nữa!`, threadID, 15, global.khanhdayr.splice(0, 1), messageID);
        }

        // === Đa ngôn ngữ cho command ===
        let getText2 = () => {};
        if (command.languages && typeof command.languages === 'object' && command.languages.hasOwnProperty(global.config.language)) {
            getText2 = (...values) => {
                let lang = command.languages[global.config.language][values[0]] || '';
                for (let i = values.length; i > 0; i--) {
                    const expReg = RegExp('%' + i, 'g');
                    lang = lang.replace(expReg, values[i]);
                }
                return lang;
            };
        }
        // === Thực thi command ===
        try {
            const Obj = {
                api,
                event,
                args,
                models,
                Users,
                Threads,
                Currencies,
                permssion,
                getText: getText2
            };
            await command.run(Obj);
            timestamps.set(senderID, now);
            if (DeveloperMode)
                logger(global.getText("handleCommand", "executeCommand", getTimeVN(), commandName, senderID, threadID, args.join(" "), Date.now() - now), "[DEV MODE]");
        } catch (e) {
            return api.sendMessage(global.getText("handleCommand", "commandError", commandName, e), threadID);
        }
    };
};