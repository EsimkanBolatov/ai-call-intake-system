import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Snackbar,
  Alert,
} from "@mui/material";
import { AddLocation, MyLocation, Draw } from "@mui/icons-material";

declare global {
  interface Window {
    ymaps: any;
  }
}

const YANDEX_MAPS_API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY || "";

const Heatmap: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any>(null);
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number }>({
    lat: 42.891963,
    lon: 71.33851,
  });
  const [inputLat, setInputLat] = useState<string>("42.891963");
  const [inputLon, setInputLon] = useState<string>("71.33851");
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({
    open: false,
    message: "",
    severity: "info",
  });

  // Моковые данные инцидентов (координаты вокруг центра)
  const [incidentData, setIncidentData] = useState([
    { lat: 42.891963, lon: 71.33851, weight: 5 },
    { lat: 42.8925, lon: 71.339, weight: 3 },
    { lat: 42.891, lon: 71.337, weight: 2 },
    { lat: 42.893, lon: 71.34, weight: 4 },
    { lat: 42.8905, lon: 71.3395, weight: 1 },
    { lat: 42.892, lon: 71.336, weight: 3 },
    { lat: 42.8935, lon: 71.338, weight: 2 },
  ]);

  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Загрузка Яндекс.Карт
  useEffect(() => {
    if (!window.ymaps) {
      const script = document.createElement("script");
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_API_KEY}&lang=ru_RU`;
      script.async = true;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      if (map) {
        map.destroy();
      }
    };
  }, []);

  const initMap = () => {
    window.ymaps.ready(() => {
      const newMap = new window.ymaps.Map(mapRef.current, {
        center: [coordinates.lat, coordinates.lon],
        zoom: 15,
        controls: ["zoomControl", "fullscreenControl"],
      });

      // Создаём тепловой слой
      const heatmapLayer = new window.ymaps.HeatmapLayer({
        radius: 30,
        dissipating: false,
        opacity: 0.8,
        intensityOfMidpoint: 0.2,
        gradient: {
          0.1: "rgba(128, 255, 0, 0.7)",
          0.2: "rgba(255, 255, 0, 0.8)",
          0.7: "rgba(255, 100, 0, 0.9)",
          1.0: "rgba(255, 0, 0, 1)",
        },
      });

      // Добавляем данные инцидентов
      const points = incidentData.map((incident) => ({
        type: "Point",
        coordinates: [incident.lat, incident.lon],
        properties: {
          weight: incident.weight,
        },
      }));

      heatmapLayer.setData(points);
      newMap.geoObjects.add(heatmapLayer);

      // Добавляем маркер центра
      const placemark = new window.ymaps.Placemark(
        [coordinates.lat, coordinates.lon],
        {
          balloonContent: "Центр тепловой карты",
        },
        {
          preset: "islands#redIcon",
        }
      );
      newMap.geoObjects.add(placemark);

      setMap(newMap);
      setHeatmap(heatmapLayer);
      setMapLoaded(true);
    });
  };

  // Обновление тепловой карты при изменении incidentData
  useEffect(() => {
    if (!heatmap) return;
    const points = incidentData.map((incident) => ({
      type: "Point",
      coordinates: [incident.lat, incident.lon],
      properties: {
        weight: incident.weight,
      },
    }));
    heatmap.setData(points);
  }, [incidentData, heatmap]);

  // Симуляция поступления новых инцидентов в реальном времени
  useEffect(() => {
    if (!mapLoaded) return;
    const interval = setInterval(() => {
      // Генерируем случайную точку в радиусе 0.01 градуса от центра
      const lat = coordinates.lat + (Math.random() - 0.5) * 0.01;
      const lon = coordinates.lon + (Math.random() - 0.5) * 0.01;
      const weight = Math.floor(Math.random() * 5) + 1;
      setIncidentData((prev) => [...prev, { lat, lon, weight }]);
      // Показываем уведомление
      setSnackbar({
        open: true,
        message: `Новый инцидент зарегистрирован: ${lat.toFixed(
          6
        )}, ${lon.toFixed(6)}`,
        severity: "info",
      });
    }, 10000); // каждые 10 секунд

    return () => clearInterval(interval);
  }, [mapLoaded, coordinates]);

  const handleAddPoint = () => {
    if (!map || !heatmap) return;
    // Заменяем запятые на точки для корректного парсинга
    const latStr = inputLat.replace(",", ".");
    const lonStr = inputLon.replace(",", ".");
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) {
      setSnackbar({
        open: true,
        message:
          "Некорректные координаты. Используйте числа, например 42.891963",
        severity: "error",
      });
      return;
    }

    const newPoint = {
      type: "Point",
      coordinates: [lat, lon],
      properties: { weight: 1 },
    };

    // Обновляем данные тепловой карты
    const currentData = heatmap.getData();
    heatmap.setData([...currentData, newPoint]);

    // Добавляем маркер
    const placemark = new window.ymaps.Placemark([lat, lon], {
      balloonContent: `Добавлен инцидент: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
    });
    map.geoObjects.add(placemark);

    // Центрируем карту на новой точке
    map.setCenter([lat, lon]);

    // Уведомление об успешном добавлении
    setSnackbar({
      open: true,
      message: `Инцидент добавлен: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      severity: "success",
    });
  };

  const [userLocationMarker, setUserLocationMarker] = useState<any>(null);
  const [drawingManager, setDrawingManager] = useState<any>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setSnackbar({
        open: true,
        message: "Геолокация не поддерживается вашим браузером",
        severity: "error",
      });
      return;
    }

    setSnackbar({
      open: true,
      message: "Определение местоположения...",
      severity: "info",
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const accuracy = position.coords.accuracy; // точность в метрах
        setInputLat(lat.toString());
        setInputLon(lon.toString());

        if (map) {
          // Удаляем предыдущий маркер
          if (userLocationMarker) {
            map.geoObjects.remove(userLocationMarker);
          }

          // Создаём новый маркер с иконкой человека
          const placemark = new window.ymaps.Placemark(
            [lat, lon],
            {
              balloonContent: `
                <div>
                  <strong>Ваше местоположение</strong><br/>
                  Широта: ${lat.toFixed(6)}<br/>
                  Долгота: ${lon.toFixed(6)}<br/>
                  Точность: ~${Math.round(accuracy)} м
                </div>
              `,
            },
            {
              preset: "islands#bluePersonIcon",
            }
          );
          map.geoObjects.add(placemark);
          setUserLocationMarker(placemark);

          // Центрируем карту с увеличением
          map.setCenter([lat, lon], 17);

          setSnackbar({
            open: true,
            message: `Местоположение определено! Точность: ~${Math.round(
              accuracy
            )} м`,
            severity: "success",
          });
        }
      },
      (error) => {
        let message = "Не удалось определить местоположение";
        if (error.code === error.PERMISSION_DENIED) {
          message =
            "Доступ к геолокации запрещён. Разрешите доступ в настройках браузера.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Информация о местоположении недоступна.";
        } else if (error.code === error.TIMEOUT) {
          message = "Время ожидания геолокации истекло.";
        }
        setSnackbar({
          open: true,
          message,
          severity: "error",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const toggleDrawing = () => {
    if (!map) return;
    if (!drawingManager) {
      window.ymaps.ready(() => {
        const manager = new window.ymaps.DrawingManager({
          drawingMode: "polygon",
          drawingCursor: "crosshair",
          strokeColor: "#FF0000",
          strokeWidth: 2,
          fillColor: "#FF000080",
        });
        manager.events.add("drawingcomplete", (event: any) => {
          const geometry = event.get("geoObject").geometry;
          setSnackbar({
            open: true,
            message: `Полигон нарисован. Вершин: ${
              geometry.getCoordinates()[0].length
            }`,
            severity: "success",
          });
        });
        manager.events.add("drawingstart", () => {
          setIsDrawing(true);
        });
        manager.events.add("drawingstop", () => {
          setIsDrawing(false);
        });
        map.geoObjects.add(manager);
        setDrawingManager(manager);
        manager.startDrawing();
      });
    } else {
      if (isDrawing) {
        drawingManager.stopDrawing();
        setIsDrawing(false);
      } else {
        drawingManager.startDrawing();
        setIsDrawing(true);
      }
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Тепловая карта инцидентов
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Карта показывает концентрацию инцидентов в Таразе. Добавляйте новые
        точки для обновления тепловой карты.
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Paper sx={{ p: 3, flex: 1 }}>
          <Typography variant="h6" gutterBottom>
            Управление картой
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Широта (lat)"
              value={inputLat}
              onChange={(e) => setInputLat(e.target.value)}
              fullWidth
            />
            <TextField
              label="Долгота (lon)"
              value={inputLon}
              onChange={(e) => setInputLon(e.target.value)}
              fullWidth
            />
            <Button
              variant="contained"
              startIcon={<AddLocation />}
              onClick={handleAddPoint}
              fullWidth
            >
              Добавить инцидент
            </Button>
            <Button
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={handleUseCurrentLocation}
              fullWidth
            >
              Использовать моё местоположение
            </Button>
            <Typography variant="caption" color="text.secondary">
              Центр карты: {coordinates.lat.toFixed(6)},{" "}
              {coordinates.lon.toFixed(6)}
            </Typography>
          </Stack>
        </Paper>

        <Paper sx={{ p: 0, flex: 2, overflow: "hidden" }}>
          <div
            ref={mapRef}
            style={{ width: "100%", height: "500px", borderRadius: "8px" }}
          />
        </Paper>
      </Stack>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Легенда
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 20,
              height: 20,
              backgroundColor: "rgba(128, 255, 0, 0.7)",
              borderRadius: "4px",
            }}
          />
          <Typography variant="body2">Низкая концентрация</Typography>
          <Box
            sx={{
              width: 20,
              height: 20,
              backgroundColor: "rgba(255, 255, 0, 0.8)",
              borderRadius: "4px",
            }}
          />
          <Typography variant="body2">Средняя</Typography>
          <Box
            sx={{
              width: 20,
              height: 20,
              backgroundColor: "rgba(255, 100, 0, 0.9)",
              borderRadius: "4px",
            }}
          />
          <Typography variant="body2">Высокая</Typography>
          <Box
            sx={{
              width: 20,
              height: 20,
              backgroundColor: "rgba(255, 0, 0, 1)",
              borderRadius: "4px",
            }}
          />
          <Typography variant="body2">Очень высокая</Typography>
        </Stack>
      </Paper>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Heatmap;
