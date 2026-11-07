import type { Lang } from "@/lib/lang";

/** MapLibre's own control labels (zoom buttons, attribution, ...) in the page's language; its default is English. */
const SK: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Zobraziť alebo skryť zdroje mapy",
  "AttributionControl.MapFeedback": "Spätná väzba k mape",
  "FullscreenControl.Enter": "Celá obrazovka",
  "FullscreenControl.Exit": "Zavrieť celú obrazovku",
  "GeolocateControl.FindMyLocation": "Nájsť moju polohu",
  "GeolocateControl.LocationNotAvailable": "Poloha nie je dostupná",
  "LogoControl.Title": "Logo MapLibre",
  "Map.Title": "Mapa",
  "Marker.Title": "Značka na mape",
  "NavigationControl.ResetBearing": "Nastaviť sever nahor",
  "NavigationControl.ZoomIn": "Priblížiť",
  "NavigationControl.ZoomOut": "Oddialiť",
  "Popup.Close": "Zavrieť",
  "ScaleControl.Feet": "stôp",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "ScaleControl.Miles": "míľ",
  "ScaleControl.NauticalMiles": "námorných míľ",
  "GlobeControl.Enable": "Zapnúť glóbus",
  "GlobeControl.Disable": "Vypnúť glóbus",
  "TerrainControl.Enable": "Zapnúť terén",
  "TerrainControl.Disable": "Vypnúť terén",
};

const EN: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Show or hide map credits",
  "AttributionControl.MapFeedback": "Map feedback",
  "FullscreenControl.Enter": "Enter fullscreen",
  "FullscreenControl.Exit": "Exit fullscreen",
  "GeolocateControl.FindMyLocation": "Find my location",
  "GeolocateControl.LocationNotAvailable": "Location not available",
  "LogoControl.Title": "MapLibre logo",
  "Map.Title": "Map",
  "Marker.Title": "Map marker",
  "NavigationControl.ResetBearing": "Reset bearing to north",
  "NavigationControl.ZoomIn": "Zoom in",
  "NavigationControl.ZoomOut": "Zoom out",
  "Popup.Close": "Close",
  "ScaleControl.Feet": "ft",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "ScaleControl.Miles": "mi",
  "ScaleControl.NauticalMiles": "nm",
  "GlobeControl.Enable": "Enable globe",
  "GlobeControl.Disable": "Disable globe",
  "TerrainControl.Enable": "Enable terrain",
  "TerrainControl.Disable": "Disable terrain",
};

export const mapLocale = (lang: Lang): Record<string, string> => (lang === "en" ? EN : SK);
