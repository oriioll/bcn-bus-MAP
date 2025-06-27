// 1. CONFIGURACIÓN INICIAL
// Coordenadas del área permitida (suroeste y noreste)
const southWest = L.latLng(41.30, 2.05);
const northEast = L.latLng(41.48, 2.25);
const bounds = L.latLngBounds(southWest, northEast);

// Crear el mapa centrado en Barcelona
const map = L.map('map', {
  minZoom: 13,
  maxZoom: 18,
  maxBounds: bounds,
  preferCanvas: true,
  fadeAnimation: false,
  markerZoomAnimation: false
}).setView([41.407597, 2.170374], 13);

// Añadir capa base de OpenStreetMap con respaldo
const baseLayers = {
  "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  "OpenStreetMap B&W": L.tileLayer('https://tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  })
};

// Intentar cargar la capa principal
try {
  baseLayers["OpenStreetMap"].addTo(map);
} catch (e) {
  console.warn('Error con OpenStreetMap estándar, usando respaldo B&W', e);
  baseLayers["OpenStreetMap B&W"].addTo(map);
}

// Control de capas para cambiar entre mapas base
L.control.layers(baseLayers, null, {
  position: 'topright',
  collapsed: false
}).addTo(map);

// Forzar a mantenerse dentro de los límites
map.on('drag', function() {
  map.panInsideBounds(bounds, { animate: false });
});

// Definir icono personalizado
const customIcon = L.icon({
  iconUrl: 'https://cdn0.iconfinder.com/data/icons/small-n-flat/24/678111-map-marker-512.png',
  iconSize: [30, 30],
  className: 'custom-marker-icon'
});

// Crear cluster group con el icono personalizado
const markersCluster = L.markerClusterGroup({
  spiderfyOnMaxZoom: false,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: false,
  maxClusterRadius: 60,
  animate: false,
  animateAddingMarkers: false,
  disableClusteringAtZoom: 17,
  iconCreateFunction: function(cluster) {
    return customIcon;
  }
});
map.addLayer(markersCluster);

// Variables de la API
const app_id = 'fbcb09a7';
const app_key = '267dcd3f102a0cfa4af2575975339ab6';

// 2. FUNCIONES AUXILIARES
function showNotice(message, type = 'info') {
  const notice = L.control.notice({
    message: message,
    timeout: type === 'error' ? 10000 : 5000,
    className: type
  });
  notice.addTo(map);
  return notice;
}

// Función para obtener información en tiempo real de una parada
async function getTiemposRealParada(codiParada, nombreParada) {
  try {
    const response = await fetch(`https://api.tmb.cat/v1/ibus/stops/${codiParada}?app_id=${app_id}&app_key=${app_key}`);
    
    if (!response.ok) throw new Error(`API respondió con status: ${response.status}`);
    
    const data = await response.json();
    if (!data.data) throw new Error('Datos de API no válidos');
    
    let content = `<div class="popup-content">
      <h3>${nombreParada}</h3>
      <p><strong>Código:</strong> ${codiParada}</p>`;
    
    if (data.data.ibus && data.data.ibus.length > 0) {
      content += `<div class="bus-list">
        <h4>Próximos buses:</h4>
        <table>
          <tr>
            <th>Línea</th>
            <th>Destino</th>
            <th>Llega en</th>
          </tr>`;
      
      data.data.ibus.forEach(bus => {
        const linea = bus.line || '--';
        const destino = bus.destination || '--';
        const tiempo = bus['t-in-min'] <= 0 ? 'AHORA' : `${bus['t-in-min']} min`;
        
        content += `<tr>
          <td><span class="linea-bus">${linea}</span></td>
          <td>${destino}</td>
          <td><strong>${tiempo}</strong></td>
        </tr>`;
      });
      
      content += `</table></div>`;
    } else {
      content += '<p class="no-buses">No hay buses próximos</p>';
    }
    
    content += `<p class="update-time">Actualizado: ${new Date().toLocaleTimeString()}</p></div>`;
    return content;
  } catch (error) {
    console.error('Error obteniendo tiempos reales:', error);
    return `<div class="popup-content error">
      <h3>${nombreParada}</h3>
      <p><strong>Código:</strong> ${codiParada}</p>
      <p class="error-message">Error al cargar información en tiempo real</p>
    </div>`;
  }
}

// 3. FUNCIÓN PRINCIPAL PARA CARGAR PARADAS
async function loadParadas() {
  // Mostrar loader
  const loader = L.control({position: 'topright'});
  loader.onAdd = function() {
    this._div = L.DomUtil.create('div', 'loader-control');
    this._div.innerHTML = '<div class="loader">Cargando paradas...</div>';
    return this._div;
  };
  loader.addTo(map);
  
  // Mostrar mensaje de carga
  const loadingNotice = showNotice('Cargando paradas de bus...');

  try {
    markersCluster.clearLayers();
    markersCluster.suspendWork();

    const response = await fetch(`https://api.tmb.cat/v1/transit/parades?app_id=${app_id}&app_key=${app_key}`);
    
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.features || !Array.isArray(data.features)) {
      throw new Error('Formato de datos inválido');
    }

    const validMarkers = [];
    let invalidCount = 0;

    data.features.forEach((parada, index) => {
      try {
        if (!parada.geometry?.coordinates || 
            !parada.properties?.NOM_PARADA || 
            !parada.properties?.CODI_PARADA) {
          invalidCount++;
          return;
        }

        const [lon, lat] = parada.geometry.coordinates;
        const nombre = parada.properties.NOM_PARADA;
        const codi = parada.properties.CODI_PARADA;

        if (!bounds.contains([lat, lon])) {
          invalidCount++;
          return;
        }

        const marker = L.marker([lat, lon], {
          title: nombre,
          codi_parada: codi,
          icon: customIcon
        });

        marker.bindPopup(`
          <div class="popup-content">
            <h3>${nombre}</h3>
            <p><strong>Código:</strong> ${codi}</p>
            <div class="loading-info">
              <p>Cargando información de buses...</p>
            </div>
          </div>
        `, { maxWidth: 300, minWidth: 250 });

        marker.on('popupopen', async function() {
          const content = await getTiemposRealParada(codi, nombre);
          marker.setPopupContent(content);
        });

        validMarkers.push(marker);
      } catch (error) {
        invalidCount++;
      }
    });

    if (validMarkers.length > 0) {
      markersCluster.addLayers(validMarkers);
      showNotice(`${validMarkers.length} paradas cargadas`, 'info');
    } else {
      throw new Error('No se encontraron paradas válidas');
    }
  } catch (error) {
    console.error('Error cargando paradas:', error);
    showNotice(`Error: ${error.message}`, 'error');
  } finally {
    markersCluster.resumeWork();
    map.removeControl(loader);
    loadingNotice.remove();
  }
}

// 4. INICIALIZACIÓN
map.whenReady(() => {
  // Verificar que el mapa se cargó correctamente
  if (!map || typeof map.setView !== 'function') {
    showNotice('Error crítico: El mapa no se inicializó correctamente', 'error');
    return;
  }

  // Cargar paradas después de 1 segundo
  setTimeout(loadParadas, 1000);
  
  // Recargar al mover el mapa
  let reloadTimeout;
  map.on('moveend', () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(loadParadas, 1500);
  });
});

// 5. MANEJO DE CLIC EN CLUSTERS
markersCluster.on('clusterclick', function(a) {
  const cluster = a.layer;
  const markers = cluster.getAllChildMarkers();
  
  let content = '<div class="cluster-popup"><h4>Paradas en esta zona:</h4><ul>';
  
  markers.slice(0, 10).forEach(marker => {
    content += `<li>${marker.options.title} (${marker.options.codi_parada})</li>`;
  });
  
  if (markers.length > 10) {
    content += `<li>...y ${markers.length - 10} más</li>`;
  }
  
  content += '</ul><p>Haz clic en una parada para ver los buses</p></div>';
  
  cluster.bindPopup(content, { maxWidth: 300 }).openPopup();
});