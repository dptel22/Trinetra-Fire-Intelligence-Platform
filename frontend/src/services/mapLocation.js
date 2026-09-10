/**
 * mapLocation.js — MapLibre flyTo helpers for FireMapPage.
 *
 * Ports the existing MapLocationController from React-Leaflet exactly:
 * - reads ?lat/lon/h3/name URL search params and fires flyTo on mount / param change
 * - listens for the global `trinetra:locate` window event (dispatched by QuickSearchModal)
 * - deduplicates consecutive calls via lastTargetRef key `lat,lon,h3` to avoid re-flying
 *   when params are the same across renders
 *
 * Coordinate order: Leaflet used [lat, lon]; MapLibre uses {center: [lon, lat]}.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * useMapLocation — call once inside FireMapPage, pass the MapLibre map instance ref
 * and an optional callback that receives the selected location detail object.
 *
 * @param {React.RefObject} mapRef  — ref whose .current is the MapLibre Map instance
 * @param {Function} onSelectLocation — optional callback({lat, lon, h3, name})
 */
export function useMapLocation(mapRef, onSelectLocation) {
  const [searchParams] = useSearchParams();
  const lastTargetRef = useRef(null);

  // Stable callback ref — prevents stale closure issues without adding onSelectLocation
  // to the effect dep array (matching original MapLocationController pattern).
  const onSelectLocationRef = useRef(onSelectLocation);
  onSelectLocationRef.current = onSelectLocation;

  // --- URL param flyTo ---
  useEffect(() => {
    const map = mapRef?.current?.getMap?.() ?? mapRef?.current;
    if (!map) return;

    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const h3  = searchParams.get('h3');
    const name = searchParams.get('name');

    if (lat && lon) {
      const key = `${lat},${lon},${h3}`;
      if (lastTargetRef.current !== key) {
        lastTargetRef.current = key;
        const targetLat = Number.parseFloat(lat);
        const targetLon = Number.parseFloat(lon);
        if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)
          || targetLat < -90 || targetLat > 90 || targetLon < -180 || targetLon > 180) {
          return;
        }

        // MapLibre flyTo: center is [lon, lat]
        map.flyTo({ center: [targetLon, targetLat], zoom: 9, duration: 1500 });

        onSelectLocationRef.current?.({ lat: targetLat, lon: targetLon, h3, name });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // mapRef is a stable ref object, excluded intentionally

  // --- trinetra:locate event flyTo ---
  useEffect(() => {
    const handleLocateEvent = (e) => {
      const map = mapRef?.current?.getMap?.() ?? mapRef?.current;
      if (!map) return;
      const { lat, lon, h3, name } = e.detail ?? {};
      const targetLat = Number(lat);
      const targetLon = Number(lon);
      if (Number.isFinite(targetLat) && Number.isFinite(targetLon)
        && targetLat >= -90 && targetLat <= 90 && targetLon >= -180 && targetLon <= 180) {
        map.flyTo({ center: [targetLon, targetLat], zoom: 9, duration: 1500 });
        onSelectLocationRef.current?.({ lat: targetLat, lon: targetLon, h3, name });
      }
    };

    window.addEventListener('trinetra:locate', handleLocateEvent);
    return () => window.removeEventListener('trinetra:locate', handleLocateEvent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — only subscribes once
}
