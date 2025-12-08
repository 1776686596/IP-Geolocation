// DOM 元素
const countryEl = document.getElementById('country');
const latitudeEl = document.getElementById('latitude');
const longitudeEl = document.getElementById('longitude');
const updateTimeEl = document.getElementById('updateTime');
const modeEl = document.getElementById('mode');
const refreshBtn = document.getElementById('refresh-btn');
const mapFrame = document.getElementById('map-frame');
const enableToggle = document.getElementById('enable-toggle');

// 手动设置相关
const manualLatInput = document.getElementById('manual-lat');
const manualLngInput = document.getElementById('manual-lng');
const applyManualBtn = document.getElementById('apply-manual-btn');
const manualInputsDiv = document.getElementById('manual-inputs');
const modeOptions = document.querySelectorAll('.mode-option');

// 网站过滤相关
const whitelistInput = document.getElementById('whitelist-input');
const blacklistInput = document.getElementById('blacklist-input');
const addWhitelistBtn = document.getElementById('add-whitelist');
const addBlacklistBtn = document.getElementById('add-blacklist');
const whitelistItems = document.getElementById('whitelist-items');
const blacklistItems = document.getElementById('blacklist-items');

// 标签页
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// 当前设置
let currentSettings = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  displayLocation();
  setupEventListeners();
});

// 加载设置
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getSettings" }, (response) => {
      if (response && response.settings) {
        currentSettings = response.settings;
        updateUIFromSettings();
      }
      resolve();
    });
  });
}

// 根据设置更新UI
function updateUIFromSettings() {
  if (!currentSettings) return;
  
  // 更新开关状态
  enableToggle.checked = currentSettings.enabled;
  
  // 更新模式选择
  modeOptions.forEach(opt => {
    opt.classList.remove('active');
    if (opt.dataset.mode === (currentSettings.useManualLocation ? 'manual' : 'auto')) {
      opt.classList.add('active');
    }
  });
  
  // 显示/隐藏手动输入
  manualInputsDiv.style.display = currentSettings.useManualLocation ? 'block' : 'none';
  
  // 填充手动位置
  if (currentSettings.manualLocation) {
    manualLatInput.value = currentSettings.manualLocation.latitude || '';
    manualLngInput.value = currentSettings.manualLocation.longitude || '';
  }
  
  // 更新模式显示
  modeEl.textContent = currentSettings.useManualLocation ? '手动' : '自动';
  
  // 渲染列表
  renderList('whitelist');
  renderList('blacklist');
}

// 渲染白名单/黑名单
function renderList(type) {
  const container = type === 'whitelist' ? whitelistItems : blacklistItems;
  const list = currentSettings[type] || [];
  
  container.innerHTML = list.map(item => `
    <div class="list-item">
      <span>${item}</span>
      <span class="remove" data-type="${type}" data-value="${item}">✕</span>
    </div>
  `).join('');
  
  // 添加删除事件
  container.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromList(btn.dataset.type, btn.dataset.value);
    });
  });
}

// 从列表中移除
async function removeFromList(type, value) {
  currentSettings[type] = currentSettings[type].filter(item => item !== value);
  await saveSettings();
  renderList(type);
}

// 添加到列表
async function addToList(type) {
  const input = type === 'whitelist' ? whitelistInput : blacklistInput;
  const value = input.value.trim().toLowerCase();
  
  if (!value) return;
  
  if (!currentSettings[type]) {
    currentSettings[type] = [];
  }
  
  if (!currentSettings[type].includes(value)) {
    currentSettings[type].push(value);
    await saveSettings();
    renderList(type);
  }
  
  input.value = '';
}

// 保存设置
async function saveSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "saveSettings", settings: currentSettings }, () => {
      resolve();
    });
  });
}

// 设置事件监听
function setupEventListeners() {
  // 标签页切换
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
  
  // 开关切换
  enableToggle.addEventListener('change', async () => {
    currentSettings.enabled = enableToggle.checked;
    await saveSettings();
  });
  
  // 模式切换
  modeOptions.forEach(opt => {
    opt.addEventListener('click', async () => {
      modeOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      
      const isManual = opt.dataset.mode === 'manual';
      currentSettings.useManualLocation = isManual;
      manualInputsDiv.style.display = isManual ? 'block' : 'none';
      modeEl.textContent = isManual ? '手动' : '自动';
      
      await saveSettings();
      displayLocation();
    });
  });
  
  // 应用手动位置
  applyManualBtn.addEventListener('click', async () => {
    const lat = parseFloat(manualLatInput.value);
    const lng = parseFloat(manualLngInput.value);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert('请输入有效的经纬度！\n纬度范围: -90 到 90\n经度范围: -180 到 180');
      return;
    }
    
    chrome.runtime.sendMessage({
      action: "setManualLocation",
      location: {
        latitude: lat,
        longitude: lng,
        country: '手动设置',
        updateTime: new Date().toLocaleString()
      }
    }, () => {
      loadSettings();
      displayLocation();
    });
  });
  
  // 刷新按钮
  refreshBtn.addEventListener('click', () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '🔄 刷新中...';
    
    chrome.runtime.sendMessage({ action: "manualUpdate" }, (response) => {
      if (response && response.status === "ok") {
        setTimeout(displayLocation, 500);
      }
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 立即刷新';
    });
  });
  
  // 添加白名单
  addWhitelistBtn.addEventListener('click', () => addToList('whitelist'));
  whitelistInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addToList('whitelist');
  });
  
  // 添加黑名单
  addBlacklistBtn.addEventListener('click', () => addToList('blacklist'));
  blacklistInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addToList('blacklist');
  });
}

// 更新UI显示
function updateUI(locationData) {
  if (!locationData) {
    [countryEl, latitudeEl, longitudeEl, updateTimeEl].forEach(el => el.textContent = '暂无数据');
    return;
  }
  
  countryEl.textContent = locationData.country || 'N/A';
  latitudeEl.textContent = locationData.latitude?.toFixed(4) || 'N/A';
  longitudeEl.textContent = locationData.longitude?.toFixed(4) || 'N/A';
  updateTimeEl.textContent = locationData.updateTime || 'N/A';

  const payload = {
    location: locationData,
    iconUrls: {
      iconUrl: chrome.runtime.getURL('images/marker-icon.png'),
      iconRetinaUrl: chrome.runtime.getURL('images/marker-icon-2x.png'),
      shadowUrl: chrome.runtime.getURL('images/marker-shadow.png')
    },
    clickable: currentSettings?.useManualLocation || false
  };
  
  mapFrame.onload = () => {
    mapFrame.contentWindow.postMessage(payload, '*');
  };

  if (mapFrame.contentWindow) {
    mapFrame.contentWindow.postMessage(payload, '*');
  }
}

// 显示位置
function displayLocation() {
  chrome.storage.local.get(['lastLocation', 'settings'], ({ lastLocation, settings }) => {
    const currentSettings = settings || {};
    
    // 如果使用手动位置
    if (currentSettings.useManualLocation && currentSettings.manualLocation) {
      updateUI(currentSettings.manualLocation);
    } else {
      updateUI(lastLocation);
    }
  });
}

// 监听来自地图的消息（点击选择位置）
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'mapClick') {
    const { lat, lng } = event.data;
    manualLatInput.value = lat.toFixed(6);
    manualLngInput.value = lng.toFixed(6);
    
    // 如果当前在手动模式，自动切换到手动设置标签页
    if (currentSettings?.useManualLocation) {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="manual"]').classList.add('active');
      document.getElementById('tab-manual').classList.add('active');
    }
  }
});