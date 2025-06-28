// 1. CONFIGURACIÓN INICIAL DEL MAPA
const southWest = L.latLng(41.25, 1.95);
const northEast = L.latLng(41.53, 2.35);
const bounds = L.latLngBounds(southWest, northEast);

const map = L.map('map', {
  minZoom: 12,
  maxZoom: 18,
  maxBounds: bounds,
  maxBoundsViscosity: 0.3,
  preferCanvas: true
}).setView([41.407597, 2.170374], 13);

// Capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// 2. CONFIGURACIÓN DE CLUSTERS
const markersCluster = L.markerClusterGroup({
  disableClusteringAtZoom: 17,
  maxClusterRadius: 35,
  iconCreateFunction: function(cluster) {
    const count = cluster.getChildCount();
    const size = Math.min(30 + Math.sqrt(count) * 3, 50);
    
    return L.divIcon({
      html: `
        <div class="custom-cluster-icon">
          <img src="https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png" 
               style="width:${size}px;height:${size}px;"/>
          <span class="cluster-count">${count}</span>
        </div>`,
      className: 'custom-cluster',
      iconSize: L.point(size, size)
    });
  }
});
map.addLayer(markersCluster);

// Icono personalizado
const customIcon = L.icon({
  iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
  iconSize: [30, 30]
});

// 3. CREDENCIALES API TMB
const app_id = 'fbcb09a7';
const app_key = '267dcd3f102a0cfa4af2575975339ab6';

// 4. FUNCIÓN PARA TIEMPOS REALES (simplificada)
async function getBusTimes(stopId, stopName) {
  try {
    const response = await fetch(`https://api.tmb.cat/v1/ibus/stops/${stopId}?app_id=${app_id}&app_key=${app_key}`);
    const data = await response.json();
    
    if (!data.data?.ibus) return `<p>No hay buses próximos</p>`;
    
    const rows = data.data.ibus.slice(0, 5).map(bus => `
      <tr>
        <td>${bus.line || '--'}</td>
        <td>${bus.destination || '--'}</td>
        <td>${bus['t-in-min'] <= 0 ? 'AHORA' : `${bus['t-in-min']} min`}</td>
      </tr>`
    ).join('');
    
    return `
      <div class="bus-times">
        <h3>${stopName}</h3>
        <p><strong>Código:</strong> ${stopId}</p>
        <table>${rows}</table>
      </div>`;
  } catch (error) {
    return `<p>Error al cargar tiempos</p>`;
  }
}

// 5. CARGA DE PARADAS (simplificada)
async function loadBusStops() {
  try {
    const response = await fetch(`https://api.tmb.cat/v1/transit/parades?app_id=${app_id}&app_key=${app_key}`);
    const data = await response.json();
    
    const markers = data.features
      .filter(stop => stop.geometry?.coordinates)
      .map(stop => {
        const [lng, lat] = stop.geometry.coordinates;
        const marker = L.marker([lat, lng], { icon: customIcon });
        
        marker.bindPopup(`
          <div>
            <h3>${stop.properties.NOM_PARADA}</h3>
            <p>Cargando tiempos...</p>
          </div>
        `);
        
        marker.on('popupopen', async () => {
          const content = await getBusTimes(stop.properties.CODI_PARADA, stop.properties.NOM_PARADA);
          marker.setPopupContent(content);
        });
        
        return marker;
      });
    
    markersCluster.clearLayers().addLayers(markers);
  } catch (error) {
    console.error('Error:', error);
  }
}

// 6. INICIALIZACIÓN
map.whenReady(loadBusStops);


// ESTADO DE CONEXION PARA EL HEADER
// Comprueba el estado de la conexión y actualiza el header
function updateConnectionStatus() {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;

  if (navigator.onLine) {
    statusEl.textContent = '🟢 Conectado';
  } else {
    statusEl.textContent = '🔴 Sin conexión';
  }
}

// Escucha los eventos de cambio de conexión
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Llama al cargar la página
updateConnectionStatus();

// Actualizar hora de última actualización
function updateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('update-time').textContent = timeString;
}

// Llamar al cargar y al actualizar paradas
updateTime();
map.on('moveend', updateTime);