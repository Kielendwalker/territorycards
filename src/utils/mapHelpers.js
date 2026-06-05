// Map helper utilities extracted from index.html

export function normalizeAreaNumber(value) {
      const raw = String(value || "").trim().toUpperCase();
      if (!raw) return "";

      const compact = raw.replace(/\s+/g, "");
      if (areaByName.has(compact)) return compact;

      const unitMatch = compact.match(/U\D*0*(\d+)$/);
      if (unitMatch) {
        const normalizedUnit = "U" + unitMatch[1].padStart(2, "0");
        if (areaByName.has(normalizedUnit)) return normalizedUnit;
      }

      const numbers = compact.match(/\d+/g);
      if (numbers) {
        const last = numbers[numbers.length - 1];
        const padded = String(Number(last)).padStart(3, "0");
        if (areaByName.has(padded)) return padded;
        if (areaByName.has(last)) return last;
      }

      return compact;
    }

export function toLatLngs(area) {
      return area.coords.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
    }

export function styleForArea(area, selected = false, dimmed = false) {
      if (selected) {
        return {
          color: "#d96c00",
          fillColor: "#ffcf5a",
          fillOpacity: 0.58,
          opacity: 1,
          weight: 5
        };
      }

      return {
        color: area.stroke || area.color,
        fillColor: area.color,
        fillOpacity: dimmed ? 0.09 : Math.max(area.fillOpacity, 0.2),
        opacity: dimmed ? 0.45 : 0.92,
        weight: dimmed ? 1 : 1.5
      };
    }

export function setLayerVisible(layer, visible) {
      const isVisible = map.hasLayer(layer);
      if (visible && !isVisible) {
        layer.addTo(map);
      } else if (!visible && isVisible) {
        layer.remove();
      }
    }
