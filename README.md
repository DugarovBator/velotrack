<div align="center">

# 🚴 VeloTrack PWA

### Профессиональный GPS-трекер для велосипедистов

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/ru/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/ru/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/ru/docs/Web/JavaScript)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-00ff88?style=for-the-badge)](./LICENSE)

<br/>

> **Темная, агрессивная тема. Огромный спидометр. Работает без интернета.**  
> Открываешь прямо с телефона — и едешь.

<br/>

![VeloTrack Screenshot](https://img.shields.io/badge/dark_theme-neon_green-00ff88?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwZmY4OCIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+)

</div>

---

## 📋 Содержание

- [О проекте](#-о-проекте)
- [Возможности](#-возможности)
- [Стек технологий](#-стек-технологий)
- [Быстрый старт](#-быстрый-старт)
- [Установка на телефон](#-установка-на-телефон)
- [GPS-симулятор](#-gps-симулятор)
- [Архитектура](#-архитектура)
- [Структура файлов](#-структура-файлов)
- [Лицензия](#-лицензия)

---

## 🎯 О проекте

**VeloTrack** — это прогрессивное веб-приложение (PWA) для отслеживания велосипедных тренировок в реальном времени. Написано на чистом Vanilla JavaScript без каких-либо UI-фреймворков.

Приложение работает прямо в браузере смартфона, устанавливается на главный экран как нативное приложение и **полностью функционирует без интернета** благодаря Service Worker.

Ключевая идея — **максимальная читаемость на солнце**: огромные цифры скорости видны даже через солнечные очки на скорости 30+ км/ч.

---

## ✨ Возможности

### 🛰 GPS-трекинг
- Отслеживание координат через `Geolocation API` с `enableHighAccuracy: true`
- Нативная скорость GPS (`coords.speed`) с fallback-расчётом между двумя точками
- **Сглаживание скорости** — скользящее среднее по 5 последним значениям (убирает GPS-джиттер)
- Расчёт дистанции по **формуле Гаверсинусов** с точностью до метра
- Фильтрация аномальных «прыжков» позиции (>300м за тик — игнорируются)

### 📊 Метрики тренировки
| Показатель | Описание |
|---|---|
| ⚡ Текущая скорость | км/ч, обновляется с каждым GPS-тиком |
| 📍 Дистанция | километры, точность до 10м |
| ⏱ Время | формат ММ:СС / ЧЧ:ММ:СС |
| 📈 Средняя скорость | дистанция / время |
| 🔥 Максимальная скорость | пик за всю тренировку |
| 🍎 Калории | формула MET × вес (75кг) × часы |

### 📉 График скорости в реальном времени
- Линейный Chart.js с **нeon-зелёной** линией
- Плавная кривая (`tension: 0.4`), без видимых точек
- Градиентная заливка под кривой
- Скользящее окно: последние **60 точек** (старые уходят влево)
- Динамическая подпись «пик X.X км/ч»

### 🎨 Дизайн
- Темная тема (`#0a0a0f` фон, неоновый `#00ff88`)
- Шрифты: **Orbitron** (цифры) + **Inter** (текст)
- Цветовая полоска скорости: 🔵 низкая → 🟡 средняя → 🔴 высокая
- Анимированный GPS-бейдж, мигающий при поиске сигнала
- Кнопка меняет цвет: 🟢 СТАРТ → 🟡 ПАУЗА → 🔴 СТОП

### 📵 Офлайн-режим
- **Service Worker** с Cache First стратегией
- Все ресурсы кешируются при первом запуске
- Работает без интернета (нет сети — приложение всё равно открывается)
- Push-уведомления (заготовка для напоминаний о тренировках)

### 💾 История тренировок
- Автосохранение в **LocalStorage** (до 50 записей)
- Каждая тренировка: дата, дистанция, время, средняя и максимальная скорость, калории
- Кнопка «Очистить всё»

### 💡 Wake Lock
- Экран смартфона **не гаснет** во время тренировки
- `navigator.wakeLock.request('screen')` с переподключением при возврате на вкладку

---

## 🛠 Стек технологий

```
HTML5          — семантическая разметка, PWA-мета-теги
CSS3           — custom properties, grid, animations, glassmorphism
Vanilla JS     — ES2020+, async/await, Geolocation API
Chart.js 4.4   — интерактивный график скорости
Service Worker — кеш, офлайн, push
Web App Manifest — установка как нативное приложение
LocalStorage   — история тренировок
Wake Lock API  — экран не гаснет
```

**Без фреймворков. Без сборщиков. Без зависимостей в package.json.**

---

## 🚀 Быстрый старт

### Вариант 1 — Python (встроен в macOS/Linux/Windows)
```bash
git clone https://github.com/DugarovBator/velotrack.git
cd velotrack
python -m http.server 3000
```
Открыть: **http://localhost:3000**

### Вариант 2 — Node.js (если установлен)
```bash
npx serve .
```

### Вариант 3 — VS Code Live Server
Установи расширение **Live Server**, открой `index.html`, нажми **Go Live**.

> ⚠️ **Важно:** Открывать через HTTP-сервер, не через `file://`.  
> Service Worker и Geolocation API требуют либо `localhost`, либо HTTPS.

---

## 📱 Установка на телефон

VeloTrack можно установить как нативное приложение — без App Store и Google Play.

### Android (Chrome)
1. Открыть сайт в **Chrome**
2. Нажать `⋮` (меню) → **"Добавить на главный экран"**
3. Нажать **"Установить"**

### iOS (Safari)
1. Открыть сайт в **Safari**
2. Нажать кнопку **"Поделиться"** `⎙`
3. Выбрать **"На экран «Домой»"**
4. Нажать **"Добавить"**

После установки приложение запускается в `standalone`-режиме — без адресной строки браузера, как настоящее нативное приложение.

---

## 🎮 GPS-симулятор

Так как реальный GPS недоступен в браузере на компьютере, в VeloTrack встроен **GPS-симулятор**, который передаёт в трекер фейковые координаты — он использует тот же код-путь, что и реальный GPS.

Открой **DevTools** (`F12`) → вкладку **Console** и введи:

```js
// Старт симуляции (≈20 км/ч), тренировка запускается автоматически
VeloSim.start()

// Старт с определённой скоростью (м/с → км/ч: 8 м/с = 28.8 км/ч)
VeloSim.start(8)

// Изменить скорость на ходу
VeloSim.setSpeed(5)       // 5 м/с = 18 км/ч

// Готовые сценарии поездок
VeloSim.jogRoute()        // 🏙 Городская прогулка: 10–18 км/ч
VeloSim.sprintRoute()     // ⚡ Шоссе: 28–38 км/ч
VeloSim.mountainRoute()   // ⛰ Горная трасса: переменная скорость

// Остановить симулятор
VeloSim.stop()

// Текущее состояние симулятора
VeloSim.status()
```

Симулятор обновляет позицию каждые 2 секунды, слегка виляет направлением движения и добавляет небольшой разброс скорости — как в реальности.

---

## 🏗 Архитектура

```
Машина состояний тренировки:

  idle ──[СТАРТ]──▶ running ──[ПАУЗА]──▶ paused
   ▲                   │                     │
   │                   │                  [СТОП]
   │               [Сброс]                   │
   └───────────────────▼─────────────────────┘
                   stopWorkout()
                        │
                showSummaryModal()
                        │
              saveWorkoutToHistory()
```

```
GPS-обработчик _onGPSUpdate():

  coords.speed (м/с)     ──▶  перевод в км/ч
       │                              │
  coords не даёт speed  ──▶  haversine(prev, curr) / Δt
                                       │
                               сглаживание (buffer[5])
                                       │
                              State.currentSpeed
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                      │
              _renderSpeed()                       _updateChart()
           (большой спидометр)               (Chart.js скользит)
```

---

## 📁 Структура файлов

```
velotrack/
├── index.html          — разметка (все экраны, модалки, toast)
├── style.css           — темная тема, анимации, адаптив (936 строк)
├── app.js              — вся логика: State Machine, GPS, Chart (~1300 строк)
├── manifest.json       — PWA: иконки, цвета, standalone-режим
├── service-worker.js   — кеш (Cache First), офлайн, push
├── icons/
│   ├── icon-192.png    — иконка приложения 192×192
│   └── icon-512.png    — иконка приложения 512×512
├── README.md           — этот файл
├── .gitignore
└── LICENSE             — MIT
```

---

## 📄 Лицензия

Распространяется под лицензией **MIT**. Подробности в файле [LICENSE](./LICENSE).

---

<div align="center">

Сделано с ❤️ и ☕ для тех, кто крутит педали

**[⭐ Star this repo](https://github.com/DugarovBator/velotrack)** если проект оказался полезным

</div>
