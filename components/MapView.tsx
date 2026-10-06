
import React, { useEffect, useRef, useState } from 'react';
import { Activity, MapProvider } from '../types';

interface Props {
  activities: Activity[];
  userLocation: { lat: number; lng: number } | null;
  transportationMode?: string;
  onDeletePoint?: (id: string) => void;
  onMovePoint?: (id: string, newLat: number, newLng: number) => void;
  mapProvider: MapProvider;
}

const MapView: React.FC<Props> = ({ 
  activities, 
  userLocation, 
  transportationMode, 
  onDeletePoint, 
  onMovePoint,
  mapProvider
}) => {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [showUserLoc, setShowUserLoc] = useState(true);
  const [showTraffic, setShowTraffic] = useState(false);
  const [showSatellite, setShowSatellite] = useState(false);
  
  const routeLayerRef = useRef<any>(null);
  const trafficLayerRef = useRef<any>(null);
  const satelliteLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  
  const leafletMapRef = useRef<any>(null);
  const leafletMarkersRef = useRef<any[]>([]);
  const leafletUserMarkerRef = useRef<any>(null);
  const leafletRouteRef = useRef<any>(null);
  const leafletSatelliteRef = useRef<any>(null);

  const [amapLoaded, setAmapLoaded] = useState(false);

  useEffect(() => {
    const checkAMap = () => {
      if ((window as any).AMap) {
        setAmapLoaded(true);
      } else {
        setTimeout(checkAMap, 200);
      }
    };
    checkAMap();
  }, []);

  const cleanup = () => {
    // 彻底清理 AMap 资源
    if (mapRef.current) {
      if (routeLayerRef.current) {
        try {
          // AMap 的路径规划插件通常需要显式调用 clear 或 setMap(null)
          if (typeof routeLayerRef.current.clear === 'function') routeLayerRef.current.clear();
          if (typeof routeLayerRef.current.setMap === 'function') routeLayerRef.current.setMap(null);
        } catch (e) {}
        routeLayerRef.current = null;
      }
      if (trafficLayerRef.current) {
        mapRef.current.remove(trafficLayerRef.current);
        trafficLayerRef.current = null;
      }
      if (satelliteLayerRef.current) {
        mapRef.current.remove(satelliteLayerRef.current);
        satelliteLayerRef.current = null;
      }
      mapRef.current.clearMap(true);
      markersRef.current = [];
      userMarkerRef.current = null;
      mapRef.current.destroy();
      mapRef.current = null;
    }

    // 彻底清理 Leaflet 资源
    if (leafletMapRef.current) {
      leafletMarkersRef.current.forEach(m => m.remove());
      leafletMarkersRef.current = [];
      if (leafletUserMarkerRef.current) leafletUserMarkerRef.current.remove();
      leafletUserMarkerRef.current = null;
      if (leafletRouteRef.current) {
        leafletRouteRef.current.remove();
        leafletRouteRef.current = null;
      }
      if (leafletSatelliteRef.current) {
        leafletSatelliteRef.current.remove();
        leafletSatelliteRef.current = null;
      }
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }
    
    setRouteInfo(null);
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  useEffect(() => {
    cleanup();
  }, [mapProvider]);

  useEffect(() => {
    if (!containerRef.current) return;

    const validActivities = activities.filter(a => 
      a.lat !== undefined && a.lng !== undefined && 
      !isNaN(Number(a.lat)) && !isNaN(Number(a.lng))
    );

    if (mapProvider === 'AMap') {
      const AMap = (window as any).AMap;
      if (!AMap || !amapLoaded) return;

      if (!mapRef.current) {
        const initialCenter = userLocation 
          ? [Number(userLocation.lng), Number(userLocation.lat)] 
          : (validActivities.length > 0 ? [Number(validActivities[0].lng), Number(validActivities[0].lat)] : [116.397428, 39.90923]);

        try {
          const map = new AMap.Map(containerRef.current, {
            zoom: 12,
            center: initialCenter,
            viewMode: '3D',
          });
          mapRef.current = map;
        } catch (e) {
          console.error("AMap initialization failed:", e);
          return;
        }
      }

      const map = mapRef.current;
      
      // 在渲染新内容前，首先显式清除已有的路线图层，防止由于数据更新导致的线路重叠
      if (routeLayerRef.current) {
        try {
          if (typeof routeLayerRef.current.clear === 'function') routeLayerRef.current.clear();
          if (typeof routeLayerRef.current.setMap === 'function') routeLayerRef.current.setMap(null);
        } catch (e) {}
        routeLayerRef.current = null;
      }
      
      // 清除其他覆盖物
      map.clearMap(true); 
      markersRef.current = [];

      // 处理路况图层
      if (showTraffic) {
        if (!trafficLayerRef.current) {
          trafficLayerRef.current = new AMap.TileLayer.Traffic({ zIndex: 10 });
          map.add(trafficLayerRef.current);
        }
      } else if (trafficLayerRef.current) {
        map.remove(trafficLayerRef.current);
        trafficLayerRef.current = null;
      }

      // 处理卫星图层
      if (showSatellite) {
        if (!satelliteLayerRef.current) {
          satelliteLayerRef.current = new AMap.TileLayer.Satellite({ zIndex: 1 });
          map.add(satelliteLayerRef.current);
        }
      } else if (satelliteLayerRef.current) {
        map.remove(satelliteLayerRef.current);
        satelliteLayerRef.current = null;
      }

      // 处理用户位置标记
      if (userLocation && showUserLoc) {
        const uMarker = new AMap.Marker({
          position: [Number(userLocation.lng), Number(userLocation.lat)],
          content: '<div style="width: 20px; height: 20px; background: #3b82f6; border: 4px solid white; border-radius: 50%; box-shadow: 0 0 15px rgba(59,130,246,0.6); position: relative;"><div style="position: absolute; inset: -4px; border-radius: 50%; background: #3b82f6; opacity: 0.2; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div></div>',
          offset: new AMap.Pixel(-10, -10),
          zIndex: 200
        });
        uMarker.setMap(map);
        userMarkerRef.current = uMarker;
      }

      validActivities.forEach((activity, idx) => {
        const color = activity.completed ? "#10b981" : "#3b82f6";
        const marker = new AMap.Marker({
          position: [Number(activity.lng), Number(activity.lat)],
          content: `
            <div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 900;">
              ${idx + 1}
            </div>
          `,
          offset: new AMap.Pixel(-16, -32),
          draggable: !!onMovePoint,
          extData: { id: activity.id }
        });

        marker.setMap(map);
        markersRef.current.push(marker);

        if (onMovePoint) {
          marker.on('dragend', (e: any) => {
            onMovePoint(activity.id, e.lnglat.lat, e.lnglat.lng);
          });
        }

        const infoWindow = new AMap.InfoWindow({
          isCustom: true,
          content: `
            <div style="background: white; padding: 16px; border-radius: 1rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); min-width: 200px; border: 1px solid #f1f5f9;">
              <div style="margin-bottom: 12px;">
                <h4 style="font-weight: 900; color: #1e293b; font-size: 14px; margin: 0;">${activity.title}</h4>
                <p style="font-size: 11px; color: #64748b; margin: 4px 0;">${activity.location}</p>
              </div>
              <div style="display: flex; gap: 8px;">
                <button id="amap-del-${activity.id}" style="flex: 1; background: #fee2e2; color: #dc2626; border: none; padding: 8px; border-radius: 8px; font-size: 10px; font-weight: 800; cursor: pointer;">删除</button>
                <a href="https://uri.amap.com/marker?position=${activity.lng},${activity.lat}&name=${encodeURIComponent(activity.title)}" target="_blank" style="flex: 1; text-align: center; background: #eff6ff; color: #2563eb; text-decoration: none; padding: 8px; border-radius: 8px; font-size: 10px; font-weight: 800;">导航</a>
              </div>
            </div>
          `,
          offset: new AMap.Pixel(0, -35)
        });

        marker.on('click', () => {
          infoWindow.open(map, marker.getPosition());
          setTimeout(() => {
            const delBtn = document.getElementById(`amap-del-${activity.id}`);
            if (delBtn && onDeletePoint) {
              delBtn.onclick = () => {
                onDeletePoint(activity.id);
                infoWindow.close();
              };
            }
          }, 100);
        });
      });

      if (validActivities.length > 1) {
        let routeService: any;
        const points = validActivities.map(a => new AMap.LngLat(Number(a.lng), Number(a.lat)));
        const start = points[0];
        const end = points[points.length - 1];
        const waypoints = points.slice(1, -1);

        const routeOptions = {
          map: map,
          hideMarkers: true,
          autoFitView: true,
          strokeColor: '#3b82f6',
          strokeWeight: 6,
          outlineColor: '#fff',
          isOutline: true,
        };

        try {
          if (transportationMode?.includes('步行')) {
            routeService = new AMap.Walking(routeOptions);
          } else if (transportationMode?.includes('骑行')) {
            routeService = new AMap.Riding(routeOptions);
          } else if (transportationMode?.includes('公共交通')) {
            routeService = new AMap.Transfer({ ...routeOptions, city: '全国' });
          } else {
            routeService = new AMap.Driving({ ...routeOptions, policy: AMap.DrivingPolicy.LEAST_TIME });
          }

          routeLayerRef.current = routeService;

          routeService.search(start, end, { waypoints }, (status: string, result: any) => {
            if (status === 'complete' && result.routes && result.routes[0]) {
              const route = result.routes[0];
              setRouteInfo({ 
                distance: (route.distance / 1000).toFixed(1), 
                duration: Math.round(route.time / 60).toString() 
              });
            } else {
              setRouteInfo(null);
            }
          });
        } catch (e) { 
          setRouteInfo(null);
        }
      } else {
        setRouteInfo(null);
        if (validActivities.length > 0) map.setCenter([Number(validActivities[0].lng), Number(validActivities[0].lat)]);
      }

      if (validActivities.length > 0) {
        setTimeout(() => { if (mapRef.current) mapRef.current.setFitView(undefined, false, [60, 60, 60, 60]); }, 300);
      }

    } else if (mapProvider === 'Leaflet') {
      const L = (window as any).L;
      if (!L) return;

      if (!leafletMapRef.current) {
        const initialCenter = userLocation 
          ? [Number(userLocation.lat), Number(userLocation.lng)] 
          : (validActivities.length > 0 ? [Number(validActivities[0].lat), Number(validActivities[0].lng)] : [39.90923, 116.397428]);

        leafletMapRef.current = L.map(containerRef.current).setView(initialCenter, 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(leafletMapRef.current);
      }

      const map = leafletMapRef.current;
      
      // 在 Leaflet 渲染新内容前清除旧的 Polyline
      if (leafletRouteRef.current) {
        leafletRouteRef.current.remove();
        leafletRouteRef.current = null;
      }

      // 处理卫星图层
      if (showSatellite) {
        if (!leafletSatelliteRef.current) {
          leafletSatelliteRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          }).addTo(map);
        }
      } else if (leafletSatelliteRef.current) {
        leafletSatelliteRef.current.remove();
        leafletSatelliteRef.current = null;
      }

      leafletMarkersRef.current.forEach(m => m.remove());
      leafletMarkersRef.current = [];
      if (leafletUserMarkerRef.current) leafletUserMarkerRef.current.remove();
      leafletUserMarkerRef.current = null;

      if (userLocation && showUserLoc) {
        const uIcon = L.divIcon({
          className: 'custom-user-marker',
          html: '<div style="width: 16px; height: 16px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(59,130,246,0.5);"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        const uMarker = L.marker([userLocation.lat, userLocation.lng], { icon: uIcon }).addTo(map);
        leafletUserMarkerRef.current = uMarker;
      }

      validActivities.forEach((activity, idx) => {
        const color = activity.completed ? "#10b981" : "#3b82f6";
        const icon = L.divIcon({
          className: 'custom-activity-marker',
          html: `
            <div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 900;">
              ${idx + 1}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const marker = L.marker([Number(activity.lat), Number(activity.lng)], { 
          icon, 
          draggable: !!onMovePoint 
        }).addTo(map);
        
        marker.bindPopup(`
          <div style="padding: 4px; min-width: 150px;">
            <h4 style="font-weight: 900; margin-bottom: 4px;">${activity.title}</h4>
            <p style="font-size: 11px; color: #64748b; margin-bottom: 8px;">${activity.location}</p>
            <div style="display: flex; gap: 4px;">
              <button onclick="window.leafletDelete('${activity.id}')" style="flex: 1; background: #fee2e2; color: #dc2626; border: none; padding: 6px; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer;">删除</button>
            </div>
          </div>
        `);

        if (onMovePoint) {
          marker.on('dragend', (e: any) => {
            const pos = e.target.getLatLng();
            onMovePoint(activity.id, pos.lat, pos.lng);
          });
        }

        leafletMarkersRef.current.push(marker);
      });

      if (validActivities.length > 1) {
        const latlngs = validActivities.map(a => [Number(a.lat), Number(a.lng)]);
        leafletRouteRef.current = L.polyline(latlngs, { color: '#3b82f6', weight: 6, opacity: 0.8 }).addTo(map);
        map.fitBounds(leafletRouteRef.current.getBounds(), { padding: [50, 50] });
        setRouteInfo(null);
      } else if (validActivities.length === 1) {
        map.setView([validActivities[0].lat, validActivities[0].lng], 12);
      }

      (window as any).leafletDelete = (id: string) => {
        if (onDeletePoint) onDeletePoint(id);
      };
    }

  }, [activities, userLocation, transportationMode, onDeletePoint, onMovePoint, amapLoaded, mapProvider, showUserLoc, showTraffic, showSatellite]);

  return (
    <div className="bg-slate-100 p-1 rounded-[2rem] border border-slate-200 mb-6 relative overflow-hidden shadow-inner animate-fade-in">
      <div ref={containerRef} className="w-full h-[350px] md:h-[480px] rounded-[1.8rem] overflow-hidden bg-slate-200"></div>
      
      {mapProvider === 'AMap' && !amapLoaded && (
        <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-sm flex items-center justify-center z-[1000]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">初始化高德地图渲染引擎...</span>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 z-[500] bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-[9px] font-black text-slate-700 shadow-lg border border-white flex items-center gap-2">
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
        {mapProvider === 'AMap' ? '高德动态路网' : 'OpenStreetMap'} {activities.length > 0 ? `| ${activities.length} 个锚点` : ''}
      </div>

      <div className="absolute top-4 right-4 z-[500] flex flex-col gap-3">
        {/* 我的位置按钮 */}
        <button 
          onClick={() => setShowUserLoc(!showUserLoc)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all border ${showUserLoc ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/90 backdrop-blur border-white text-slate-400 hover:text-blue-500'}`}
          title={showUserLoc ? '隐藏我的位置' : '显示我的位置'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
        </button>

        {/* 实时路况按钮 (仅 AMap 支持较好) */}
        {mapProvider === 'AMap' && (
          <button 
            onClick={() => setShowTraffic(!showTraffic)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all border ${showTraffic ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white/90 backdrop-blur border-white text-slate-400 hover:text-emerald-500'}`}
            title={showTraffic ? '隐藏实时路况' : '显示实时路况'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
            </svg>
          </button>
        )}

        {/* 卫星图层按钮 */}
        <button 
          onClick={() => setShowSatellite(!showSatellite)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all border ${showSatellite ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/90 backdrop-blur border-white text-slate-400 hover:text-indigo-500'}`}
          title={showSatellite ? '切换至标准地图' : '切换至卫星图层'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
          </svg>
        </button>
      </div>

      {routeInfo && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] flex gap-4 bg-white/95 backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl border border-blue-100 animate-fade-in">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-400 uppercase">预计距离</span>
            <span className="text-sm font-black text-blue-600">{routeInfo.distance} <span className="text-[10px]">KM</span></span>
          </div>
          <div className="w-px bg-slate-100"></div>
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-400 uppercase">预估耗时</span>
            <span className="text-sm font-black text-blue-600">{routeInfo.duration} <span className="text-[10px]">MIN</span></span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;
