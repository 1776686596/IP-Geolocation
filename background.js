const API_URL = 'https://ipgeo-api.hf.space';
const ALARM_NAME = 'updateGeoAlarm';
const FALLBACK_LOCATION = {
  latitude: 39.9042,
  longitude: 116.4074,
  country: '中国 (隐私保护)'
};

// 默认设置
const DEFAULT_SETTINGS = {
  enabled: true,
  useManualLocation: false,
  manualLocation: null,
  whitelist: [],  // 白名单网站（不伪装）
  blacklist: []   // 黑名单网站（仅伪装这些）
};

// 更新扩展图标状态
async function updateBadge() {
  const { settings } = await chrome.storage.local.get('settings');
  const currentSettings = { ...DEFAULT_SETTINGS, ...settings };
  
  if (currentSettings.enabled) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#9E9E9E' });
  }
}

// 检查URL是否应该被伪装
function shouldSpoof(url, settings) {
  if (!settings.enabled) return false;
  if (!url) return false;
  
  try {
    const hostname = new URL(url).hostname;
    
    // 如果有黑名单，只伪装黑名单中的网站
    if (settings.blacklist && settings.blacklist.length > 0) {
      return settings.blacklist.some(pattern => hostname.includes(pattern));
    }
    
    // 如果有白名单，不伪装白名单中的网站
    if (settings.whitelist && settings.whitelist.length > 0) {
      return !settings.whitelist.some(pattern => hostname.includes(pattern));
    }
    
    return true;
  } catch {
    return false;
  }
}

const spooferFunction = (latitude, longitude) => {
  navigator.geolocation.getCurrentPosition = (successCallback, errorCallback, options) => {
    successCallback({
      coords: {
        latitude: latitude,
        longitude: longitude,
        accuracy: 20 + Math.random() * 10,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null
      },
      timestamp: Date.now()
    });
  };
  navigator.geolocation.watchPosition = (successCallback, errorCallback, options) => {
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
    return Math.floor(Math.random() * 10000);
  };
};

async function injectScript(tabId, tabUrl) {
  const { settings, lastLocation } = await chrome.storage.local.get(['settings', 'lastLocation']);
  const currentSettings = { ...DEFAULT_SETTINGS, ...settings };
  
  // 检查是否应该伪装此网站
  if (!shouldSpoof(tabUrl, currentSettings)) {
    return;
  }
  
  // 确定使用哪个位置
  let locationToUse;
  if (currentSettings.useManualLocation && currentSettings.manualLocation) {
    locationToUse = currentSettings.manualLocation;
  } else {
    locationToUse = lastLocation;
  }
  
  if (locationToUse && locationToUse.latitude && locationToUse.longitude) {
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      func: spooferFunction,
      args: [locationToUse.latitude, locationToUse.longitude],
      injectImmediately: true,
      world: 'MAIN'
    }).catch(error => console.log(`无法注入到 Tab ${tabId}: ${error.message}`));
  }
}

async function updateAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      injectScript(tab.id, tab.url);
    }
  }
}

async function updateGeolocation(forceUpdate = false) {
  try {
    const { lastLocation: oldLocation } = await chrome.storage.local.get('lastLocation');
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) return;

    const data = await response.json();
    let locationToSet;

    if (data.country && data.country.code === 'CN') {
      locationToSet = FALLBACK_LOCATION;
    } else if (data.location && data.location.latitude && data.location.longitude) {
      locationToSet = {
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        country: data.country.name
      };
    } else { return; }
    
    if (!forceUpdate && oldLocation && locationToSet.latitude === oldLocation.latitude && locationToSet.longitude === oldLocation.longitude) {
      return;
    }

    await chrome.storage.local.set({
      lastLocation: { ...locationToSet, updateTime: new Date().toLocaleString() }
    });
    
    console.log(`位置已更新为: \({locationToSet.country} (\){locationToSet.latitude}, ${locationToSet.longitude})。正在更新所有标签页...`);
    await updateAllTabs();

  } catch (error) {
    console.error("后台更新地理位置失败:", error);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url) {
    injectScript(tabId, tab.url);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    updateGeolocation();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "manualUpdate") {
    (async () => {
      await updateGeolocation(true);
      sendResponse({ status: "ok" });
    })();
    return true;
  }
  
  if (request.action === "getSettings") {
    (async () => {
      const { settings } = await chrome.storage.local.get('settings');
      sendResponse({ settings: { ...DEFAULT_SETTINGS, ...settings } });
    })();
    return true;
  }
  
  if (request.action === "saveSettings") {
    (async () => {
      await chrome.storage.local.set({ settings: request.settings });
      await updateBadge();
      await updateAllTabs();
      sendResponse({ status: "ok" });
    })();
    return true;
  }
  
  if (request.action === "setManualLocation") {
    (async () => {
      const { settings } = await chrome.storage.local.get('settings');
      const newSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        manualLocation: request.location,
        useManualLocation: true
      };
      await chrome.storage.local.set({ settings: newSettings });
      await updateAllTabs();
      sendResponse({ status: "ok" });
    })();
    return true;
  }
  
  if (request.action === "toggleEnabled") {
    (async () => {
      const { settings } = await chrome.storage.local.get('settings');
      const currentSettings = { ...DEFAULT_SETTINGS, ...settings };
      const newSettings = { ...currentSettings, enabled: !currentSettings.enabled };
      await chrome.storage.local.set({ settings: newSettings });
      await updateBadge();
      sendResponse({ status: "ok", enabled: newSettings.enabled });
    })();
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  updateBadge();
  updateGeolocation(true);
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  updateGeolocation(true);
});

// 监听存储变化以更新badge
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    updateBadge();
  }
});