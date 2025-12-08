let map;
let marker;
let iconsConfigured = false;
let clickable = false;

function initMap() {
  map = L.map('map').setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);
  marker = L.marker([0, 0], { opacity: 0 }).addTo(map);
  
  // 地图点击事件
  map.on('click', function(e) {
    if (clickable) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      // 更新标记位置
      marker.setLatLng([lat, lng]);
      marker.setOpacity(1);
      marker.bindPopup(`<b>选中位置</b><br>纬度: ${lat.toFixed(6)}<br>经度: ${lng.toFixed(6)}`).openPopup();
      
      // 发送消息给父窗口
      window.parent.postMessage({
        type: 'mapClick',
        lat: lat,
        lng: lng
      }, '*');
    }
  });
}

window.addEventListener('message', event => {
  const payload = event.data;
  
  if (!payload) return;
  
  const locationData = payload.location;
  const iconUrls = payload.iconUrls;
  
  // 设置是否可点击
  if (payload.clickable !== undefined) {
    clickable = payload.clickable;
    // 更新鼠标样式
    if (clickable) {
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.getContainer().style.cursor = '';
    }
  }

  if (!iconsConfigured && iconUrls) {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: iconUrls.iconRetinaUrl,
      iconUrl: iconUrls.iconUrl,
      shadowUrl: iconUrls.shadowUrl,
    });
    iconsConfigured = true;
  }
  
  if (map && marker && locationData && locationData.latitude && locationData.longitude) {
    const latLng = [locationData.latitude, locationData.longitude];
    map.setView(latLng, 13);
    marker.setLatLng(latLng);
    marker.setOpacity(1);
    const popupContent = '<b>' + (locationData.country || '未知位置') + '</b><br>纬度: ' + locationData.latitude.toFixed(4) + '<br>经度: ' + locationData.longitude.toFixed(4);
    marker.bindPopup(popupContent).openPopup();
  }
});

initMap();