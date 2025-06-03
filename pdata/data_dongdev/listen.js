const fs = require("fs");
const path = require("path");
const moment = require('moment-timezone');
const axios = require("axios");
const Users = require("./controllers/users.js");
const Threads = require("./controllers/threads.js");
const Currencies = require("./controllers/currencies.js");
const logger = require("../utils/log.js");
const config = require("../../config.json");

// ======== BẮT ĐẦU MODULE ========
module.exports = function ({ api, models }) {
  // Require các controller với models và api
  const users = Users({ models, api });
  const threads = Threads({ models, api });
  const currencies = Currencies({ models });

  // Đường dẫn tới folder checktt
  const checkttDataPath = path.join(process.cwd(), '../../modules/commands/checktt/');

  // SetInterval cập nhật tương tác ngày/tuần
  let day = moment.tz("Asia/Ho_Chi_Minh").day();
  setInterval(async () => {
    const dayNow = moment.tz("Asia/Ho_Chi_Minh").day();
    if (day !== dayNow) {
      day = dayNow;
      const checkttData = fs.readdirSync(checkttDataPath);
      console.log('--> CHECKTT: Ngày Mới');
      for (const checkttFile of checkttData) {
        const checktt = JSON.parse(fs.readFileSync(path.join(checkttDataPath, checkttFile)));
        let storage = [], count = 1;
        for (const item of checktt.day) {
          const userName = await users.getNameUser(item.id) || 'Facebook User';
          storage.push({ ...item, name: userName });
        }
        storage.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        const timechecktt = moment.tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY || HH:mm:ss');
        const haha = `\n────────────────────\n💬 Tổng tin nhắn: ${storage.reduce((a, b) => a + b.count, 0)}\n⏰ Time: ${timechecktt}\n✏️ Các bạn khác cố gắng tương tác nếu muốn lên top nha`;
        let checkttBody = '[ TOP TƯƠNG TÁC NGÀY ]\n────────────────────\n📝 Top 10 người tương tác nhiều nhất hôm qua:\n\n';
        checkttBody += storage.slice(0, 10).map(item => `${count++}. ${item.name} - 💬 ${item.count} tin nhắn`).join('\n');
        api.sendMessage(
          { body: checkttBody + haha, attachment: global.khanhdayr ? global.khanhdayr.splice(0, 1) : [] },
          checkttFile.replace('.json', ''),
          err => err && console.log(err)
        );
        for (const e of checktt.day) e.count = 0;
        checktt.time = dayNow;
        fs.writeFileSync(path.join(checkttDataPath, checkttFile), JSON.stringify(checktt, null, 4));
      }
      if (dayNow === 1) { // Chủ nhật
        console.log('--> CHECKTT: Tuần Mới');
        for (const checkttFile of checkttData) {
          const checktt = JSON.parse(fs.readFileSync(path.join(checkttDataPath, checkttFile)));
          let storage = [], count = 1;
          for (const item of checktt.week) {
            const userName = await users.getNameUser(item.id) || 'Facebook User';
            storage.push({ ...item, name: userName });
          }
          storage.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
          const tctt = moment.tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY || HH:mm:ss');
          const dzvcl = `\n────────────────────\n⏰ Time: ${tctt}\n✏️ Các bạn khác cố gắng tương tác nếu muốn lên top nha`;
          let checkttBody = '[ TOP TƯƠNG TÁC TUẦN ]\n────────────────────\n📝 Top 10 người tương tác nhiều nhất tuần qua:\n\n';
          checkttBody += storage.slice(0, 10).map(item => `${count++}. ${item.name} - 💬 ${item.count} tin nhắn`).join('\n');
          api.sendMessage(
            { body: checkttBody + dzvcl, attachment: global.khanhdayr ? global.khanhdayr.splice(0, 1) : [] },
            checkttFile.replace('.json', ''),
            err => err && console.log(err)
          );
          for (const e of checktt.week) e.count = 0;
          fs.writeFileSync(path.join(checkttDataPath, checkttFile), JSON.stringify(checktt, null, 4));
        }
      }
      if (global.client) global.client.sending_top = false;
    }
  }, 1000 * 10);

  // Push biến từ database lên global
  (async function () {
    try {
      logger(global.getText('listen', 'startLoadEnvironment'), '[ DATABASE ]');
      let threadsData = await threads.getAll(),
        usersData = await users.getAll(['userID', 'name', 'data']),
        currenciesData = await currencies.getAll(['userID']);
      for (const data of threadsData) {
        const idThread = String(data.threadID);
        global.data.allThreadID.push(idThread);
        global.data.threadData.set(idThread, data['data'] || {});
        global.data.threadInfo.set(idThread, data.threadInfo || {});
        if (data['data'] && data['data']['banned'])
          global.data.threadBanned.set(idThread, {
            'reason': data['data']['reason'] || '',
            'dateAdded': data['data']['dateAdded'] || ''
          });
        if (data['data'] && data['data']['commandBanned'] && data['data']['commandBanned'].length !== 0)
          global['data']['commandBanned']['set'](idThread, data['data']['commandBanned']);
        if (data['data'] && data['data']['NSFW']) global['data']['threadAllowNSFW']['push'](idThread);
      }
      logger.loader(global.getText('listen', 'loadedEnvironmentThread'));
      for (const dataU of usersData) {
        const idUsers = String(dataU['userID']);
        global.data['allUserID']['push'](idUsers);
        if (dataU.name && dataU.name.length !== 0) global.data.userName.set(idUsers, dataU.name);
        if (dataU.data && dataU.data.banned == 1) global.data['userBanned']['set'](idUsers, {
          'reason': dataU['data']['reason'] || '',
          'dateAdded': dataU['data']['dateAdded'] || ''
        });
        if (dataU['data'] && dataU.data['commandBanned'] && dataU['data']['commandBanned'].length !== 0)
          global['data']['commandBanned']['set'](idUsers, dataU['data']['commandBanned']);
      }
      for (const dataC of currenciesData) global.data.allCurrenciesID.push(String(dataC['userID']));
    } catch (error) {
      logger.loader(global.getText('listen', 'failLoadEnvironment', error), 'error');
    }
  })();

  // In thông tin ADMIN, BOT lên console
  const admin = config.ADMINBOT;
  logger("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓", "[ PCODER ]");
  for (let i = 0; i < admin.length; i++) {
    logger(` ID ADMIN ${i + 1}: ${admin[i] || "Trống"}`, "[ PCODER ]");
  }
  logger(` ID BOT: ${api.getCurrentUserID()}`, "[ PCODER ]");
  logger(` PREFIX: ${global.config.PREFIX}`, "[ PCODER ]");
  logger(` NAME BOT: ${global.config.BOTNAME || "Mirai - PCODER"}`, "[ PCODER ]");
  logger("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛", "[ PCODER ]");

  // Require các handle
  const handleCommand = require("./handle/handleCommand.js")({ api, models, Users: users, Threads: threads, Currencies: currencies });
  const handleCommandEvent = require("./handle/handleCommandEvent.js")({ api, models, Users: users, Threads: threads, Currencies: currencies });
  const handleReply = require("./handle/handleReply.js")({ api, models, Users: users, Threads: threads, Currencies: currencies });
  const handleReaction = require("./handle/handleReaction.js")({ api, models, Users: users, Threads: threads, Currencies: currencies });
  const handleEvent = require("./handle/handleEvent.js")({ api, models, Users: users, Threads: threads, Currencies: currencies });
  const handleRefresh = require("./handle/handleRefresh.js")({ api, models, Users: users, Threads: threads, Currencies: currencies });
  const handleCreateDatabase = require("./handle/handleCreateDatabase.js")({ api, Threads: threads, Users: users, Currencies: currencies, models });

  logger.loader(`Ping load source code: ${Date.now() - global.client.timeStart}ms`);

  // ========= LẮNG NGHE SỰ KIỆN =========
  return async function listen(event) {
    // Xử lý anti, đổi ảnh, đổi tên nhóm, anti out, anti nickname
    const { threadID, author, image, type, logMessageType, logMessageBody, logMessageData } = event;
    let data_anti;
    try {
      data_anti = JSON.parse(fs.readFileSync(global.anti, "utf8"));
    } catch (_) {
      data_anti = { boximage: [], boxname: [], antiNickname: [], antiout: {} };
    }

    // Anti đổi ảnh nhóm
    if (type === "change_thread_image") {
      const { ADMINBOT } = global.config;
      const botID = api.getCurrentUserID();
      const threadInf = await api.getThreadInfo(threadID);
      const findAd = threadInf.adminIDs.find(el => el.id === author);
      const findAnti = data_anti.boximage.find(item => item.threadID === threadID);
      if (findAnti) {
        if (findAd || botID.includes(author)) {
          // Cập nhật url ảnh mới
          try {
            const res = await axios({
              method: "POST",
              url: "https://api.imgur.com/3/image",
              headers: { Authorization: "Client-ID 037dda57ddb9fdf" },
              data: { image: image.url }
            });
            findAnti.url = res.data.data.link;
            fs.writeFileSync(global.anti, JSON.stringify(data_anti, null, 4));
          } catch { }
        } else {
          const res = await axios.get(findAnti.url, { responseType: "stream" });
          api.sendMessage(`[ ANTI IMAGE BOX ]\n────────────────────\n⚠️ Kích hoạt chế độ chống đổi ảnh nhóm`, threadID);
          return api.changeGroupImage(res.data, threadID);
        }
      }
    }

    // Anti đổi tên nhóm
    if (logMessageType === "log:thread-name") {
      const botID = api.getCurrentUserID();
      const threadInf = await api.getThreadInfo(threadID);
      const findAd = threadInf.adminIDs.find(el => el.id === author);
      const findAnti = data_anti.boxname.find(item => item.threadID === threadID);
      if (findAnti) {
        if (findAd || botID.includes(author)) {
          findAnti.name = logMessageData.name;
          fs.writeFileSync(global.anti, JSON.stringify(data_anti, null, 4));
        } else {
          api.sendMessage(`[ ANTI NAME BOX ]\n────────────────────\n⚠️ Kích hoạt chế độ chống đổi tên nhóm\n────────────────────\n⛔ Vui lòng tắt nếu muốn đổi tên nhóm`, threadID);
          return api.setTitle(findAnti.name, threadID);
        }
      }
    }

    // Anti đổi biệt danh
    if (logMessageType === "log:user-nickname") {
      const botID = api.getCurrentUserID();
      const threadInf = await api.getThreadInfo(threadID);
      const findAd = threadInf.adminIDs.find(el => el.id === author);
      const findAnti = data_anti.antiNickname.find(item => item.threadID === threadID);
      if (findAnti) {
        if (findAd || botID.includes(author)) {
          findAnti.data[logMessageData.participant_id] = logMessageData.nickname;
          fs.writeFileSync(global.anti, JSON.stringify(data_anti, null, 4));
        } else {
          api.sendMessage(`[ ANTI NICKNAME ]\n────────────────────\n⚠️ Kích hoạt chế độ chống đổi biệt danh người dùng\n────────────────────\n⛔ Vui lòng tắt nếu muốn đổi tên tên người dùng`, threadID);
          return api.changeNickname(
            findAnti.data[logMessageData.participant_id] || "",
            threadID,
            logMessageData.participant_id
          );
        }
      }
    }

    // Anti out
    if (logMessageType === "log:unsubscribe") {
      const botID = api.getCurrentUserID();
      const threadInf = await api.getThreadInfo(threadID);
      const findAd = threadInf.adminIDs.find(el => el.id === author);
      const findAnti = data_anti.antiout[threadID] ? true : false;
      if (findAnti) {
        const typeOut = author == logMessageData.leftParticipantFbId ? "out" : "kick";
        if (typeOut === "out") {
          api.addUserToGroup(
            logMessageData.leftParticipantFbId,
            threadID,
            (error, info) => {
              const timeStr = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss || DD/MM/YYYY");
              if (error) {
                api.shareContact(`[ ANTIOUT ]\n────────────────────\n⚠️ Kích hoạt chế độ tự động thêm người dùng khi tự ý rời nhóm\n🔰 Trạng thái: Thất Bại\n👤 Người dùng: https://www.facebook.com/profile.php?id=${logMessageData.leftParticipantFbId}\n⏳ Uptime: ${process.uptime()}\n⏰ Thời gian: ${timeStr}\n────────────────────\n⛔ Nếu bot thêm thất bại có thể người dùng đã chặn bot`, logMessageData.leftParticipantFbId, threadID);
              } else {
                api.shareContact(`[ ANTIOUT ]\n────────────────────\n⚠️ Kích hoạt chế độ tự động thêm người dùng khi tự ý rời nhóm\n🔰 Trạng thái: Thành Công\n👤 Người dùng: https://www.facebook.com/profile.php?id=${logMessageData.leftParticipantFbId}\n⏳ Uptime: ${process.uptime()}\n⏰ Thời gian: ${timeStr}\n────────────────────\n⛔ Nếu bot thêm thất bại có thể người dùng đã chặn bot`, logMessageData.leftParticipantFbId, threadID);
              }
            }
          );
        }
      }
    }

    // Hàm chuyển ngày dd/mm/yyyy -> mm/dd/yyyy
    function toMMDDYYYY(dateStr) {
      if (!dateStr || typeof dateStr !== "string") return "";
      const parts = dateStr.split("/");
      if (parts.length !== 3) return "";
      return `${parts[1]}/${parts[0]}/${parts[2]}`;
    }

    // Xác định prefix lệnh
    const threadData = global.data.threadData.get(threadID) || {};
    const prefix = threadData.PREFIX || global.config.PREFIX;

    // Xử lý thuê bot (chặn lệnh nếu chưa thuê)
    if (
      (event.body || '').startsWith(prefix) &&
      event.senderID != api.getCurrentUserID() &&
      !global.config.ADMINBOT.includes(event.senderID) &&
      !global.config.NDH.includes(event.senderID)
    ) {
      let thuebot = [];
      try {
        thuebot = JSON.parse(
          fs.readFileSync(path.join(process.cwd(), 'modules/commands/cache/data_rentbot_pro/thuebot_pro.json'), 'utf8')
        );
      } catch { thuebot = []; }
      let find_thuebot = thuebot.find($ => $.t_id == threadID);

      // Chặn toàn bộ lệnh trừ lệnh bank
      const args = (event.body || '').slice(prefix.length).trim().split(/\s+/);
      if ((prefix + 'bank') !== args[0]) {
        if (!find_thuebot)
          return api.shareContact(
            `💸 Nhóm chưa thuê bot\n📝 Chỉ 30k-1th\n🙅 Liên hệ admin để thuê`,
            global.config.NDH[0],
            threadID
          );

        // Kiểm tra hết hạn (chuyển về mm/dd/yyyy, cộng thêm 7 tiếng cho đúng múi giờ VN)
        const timeEnd = find_thuebot.time_end;
        const timeEndMs = new Date(toMMDDYYYY(timeEnd)).getTime();
        const nowVN = Date.now() + (7 * 60 * 60 * 1000); // Cộng 7 tiếng (VN)
        if (isNaN(timeEndMs) || timeEndMs <= nowVN) {
          return api.shareContact(
            `💸 Thuê bot đã hết hạn\n📝 Gia hạn chỉ 30k-1th\n🙅 Liên hệ admin để tiếp tục thuê!`,
            global.config.NDH[0],
            threadID
          );
        }
      }
    }

    // Gửi thông báo đổi ảnh nhóm nếu có
    let gio = moment.tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY || HH:mm:ss');
    let thu = moment.tz('Asia/Ho_Chi_Minh').format('dddd');
    const thuVI = {
      Sunday: 'Chủ nhật',
      Monday: 'Thứ hai',
      Tuesday: 'Thứ ba',
      Wednesday: 'Thứ tư',
      Thursday: 'Thứ năm',
      Friday: 'Thứ sáu',
      Saturday: 'Thứ bảy'
    };
    thu = thuVI[thu] || thu;

    if (event.type == "change_thread_image")
      api.sendMessage(
        `» [ ${global.config.BOTNAME} ] «\n» [ CẬP NHẬT NHÓM ] «\n────────────────────\n📝 ${event.snippet}\n────────────────────\n⏰ Time: ${gio} || ${thu}`,
        event.threadID
      );

    // Xử lý các loại event
    switch (event.type) {
      case "message":
      case "message_reply":
      case "message_unsend":
        handleCreateDatabase({ event });
        handleCommand({ event });
        handleReply({ event });
        handleCommandEvent({ event });
        break;
      case "event":
        handleEvent({ event });
        handleRefresh({ event });
        if (event.type !== "change_thread_image" && global.config.notiGroup) {
          let dong = `\n────────────────────\n⏰ Time: ${gio} || ${thu}`;
          let msg = `» [ ${global.config.BOTNAME} ] «\n» [ CẬP NHẬT NHÓM ] «\n────────────────────\n📝 `;
          msg += event.logMessageBody;
          if (event.author == api.getCurrentUserID()) {
            msg = msg.replace('Bạn ', global.config.BOTNAME);
          }
          api.sendMessage(msg + dong, event.threadID, async (err, info) => {
            await new Promise(resolve => setTimeout(resolve, 5 * 1000));
            return api.unsendMessage(info.messageID);
          }, event.messageID);
        }
        break;
      case "message_reaction":
        var { iconUnsend } = global.config;
        if (
          iconUnsend &&
          iconUnsend.status &&
          event.senderID == api.getCurrentUserID() &&
          event.reaction == iconUnsend.icon
        ) {
          api.unsendMessage(event.messageID);
        }
        handleReaction({ event });
        break;
      default:
        break;
    }
  };
};