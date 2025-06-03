'use strict';

const logger = require('./logger');
const Fetch = require('got');

const BROADCAST_URL = 'https://raw.githubusercontent.com/Kenne400k/Global_Pcoder/refs/heads/main/test.json';

const broadcastConfig = {
  enabled: false,
  data: [],
};

const fetchBroadcastData = async () => {
  try {
    const response = await Fetch.get(BROADCAST_URL);
    let json;
    try {
      json = JSON.parse(response.body.toString());
    } catch (err) {
      logger.Error(`Broadcast JSON parse error: ${err.message}`);
      json = [];
    }
    broadcastConfig.data = Array.isArray(json) ? json : [];
    return broadcastConfig.data;
  } catch (error) {
    logger.Error(`Failed to fetch broadcast data: ${error.message}`);
    broadcastConfig.data = [];
    return [];
  }
};

const broadcastRandomMessage = async () => {
  await fetchBroadcastData();
  const messages = broadcastConfig.data;
  const randomMessage =
    Array.isArray(messages) && messages.length > 0
      ? messages[Math.floor(Math.random() * messages.length)]
      : 'Ae Zui Zẻ Nhé !';
  logger.Normal(`${randomMessage}`);
};

const startBroadcasting = async () => {
  const enabled = global?.Fca?.Require?.FastConfig?.BroadCast ?? false;

  if (enabled) {
    try {
      await fetchBroadcastData();
      broadcastRandomMessage();
      setInterval(broadcastRandomMessage, 10000); 
    } catch (error) {
      logger.Error(`Failed to start broadcasting: ${error.message}`);
    }
  }
};

module.exports = {
  startBroadcasting,
  broadcastRandomMessage,
  fetchBroadcastData,
};