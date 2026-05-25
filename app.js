/* =====================================================
   VeloTrack PWA — app.js
   Полная реализация GPS-трекинга велотренировок
   Архитектура: Event-driven State Machine
   ===================================================== */

'use strict';

/* ══════════════════════════════════════════════════════
   §1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
   ══════════════════════════════════════════════════════

   Единственный источник правды (Single Source of Truth).
   Все функции читают и пишут только через этот объект.
   ══════════════════════════════════════════════════════ */
const State = {
  /* ── Статус тренировки ──────────────────────────────
     'idle'    — ничего не запущено
     'running' — активная тренировка
     'paused'  — на паузе                              */
  workoutStatus: 'idle',

  /* ── Временны́е метки ──────────────────────────────── */
  startTime:    null,   // Date.now() в момент старта / возобновления
  pausedAt:     0,      // накопленное ms до момента паузы

  /* ── Метрики ────────────────────────────────────────
     totalDistance — в МЕТРАХ (точнее, меньше округлений)
     currentSpeed  — в км/ч (после сглаживания)
     maxSpeed      — в км/ч                            */
  totalDistance:  0,    // м
  currentSpeed:   0,    // км/ч
  maxSpeed:       0,    // км/ч
  calories:       0,    // ккал

  /* ── Для расчётов между тиками ─────────────────────
     rawSpeedBuffer — кольцевой буфер сырых скоростей
     для скользящего среднего (сглаживание шума GPS)    */
  previousPosition: null,  // { lat, lon, timestamp } — последняя точка
  rawSpeedBuffer:   [],    // буфер последних N скоростей

  /* ── ID таймеров / watchPosition ───────────────────  */
  timerInterval:  null,
  watchId:        null,

  /* ── GPS статус ─────────────────────────────────────
     'off' | 'searching' | 'ok' | 'error'              */
  gpsStatus: 'off',

  /* ── Симулятор (только для тестирования) ───────────  */
  simInterval:  null,
  simLat:       55.7522,   // Москва — Красная площадь
  simLon:       37.6156,
  simHeading:   45,        // направление движения (градусы)
  simSpeedMps:  5.5,       // скорость симулятора (м/с ≈ 20 км/ч)

  /* ── Wake Lock ──────────────────────────────────────  */
  wakeLock: null,

  /* ── Пользовательские настройки ────────────────────  */
  userWeightKg: 75,

  /* ── История тренировок (localStorage) ─────────────  */
  history: [],
};

/* Размер буфера сглаживания скорости (последние N значений) */
const SPEED_SMOOTH_SAMPLES = 5;

/* Макс. правдоподобная скорость велосипеда (защита от GPS-шума) */
const MAX_SPEED_KMH = 120;

/* Макс. расстояние за один GPS-тик (защита от «прыжков» позиции) */
const MAX_SEGMENT_M = 300;

/* ══════════════════════════════════════════════════════
   §2. DOM-КЭШ
   ══════════════════════════════════════════════════════ */
const DOM = {
  /* Спидометр */
  speedValue:   document.getElementById('speedValue'),
  speedBarFill: document.getElementById('speedBarFill'),

  /* Карточки статистики */
  distanceValue: document.getElementById('distanceValue'),
  timeValue:     document.getElementById('timeValue'),
  avgSpeedValue: document.getElementById('avgSpeedValue'),
  maxSpeedValue: document.getElementById('maxSpeedValue'),
  caloriesValue: document.getElementById('caloriesValue'),

  /* Карточки — нужны для CSS-анимации .active */
  cardDistance: document.getElementById('cardDistance'),
  cardTime:     document.getElementById('cardTime'),
  cardAvgSpeed: document.getElementById('cardAvgSpeed'),

  /* GPS-бейдж в шапке */
  statusBadge: document.getElementById('statusBadge'),
  statusText:  document.getElementById('statusText'),

  /* Главная кнопка */
  btnMain:  document.getElementById('btnMain'),
  btnIcon:  document.getElementById('btnIcon'),
  btnLabel: document.getElementById('btnLabel'),

  /* Вторичные кнопки */
  btnReset:   document.getElementById('btnReset'),
  btnHistory: document.getElementById('btnHistory'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),

  /* Секция истории */
  historySection: document.getElementById('historySection'),
  historyEmpty:   document.getElementById('historyEmpty'),
  historyList:    document.getElementById('historyList'),

  /* Модальное окно сводки */
  summaryModal:      document.getElementById('summaryModal'),
  summaryDistance:   document.getElementById('summaryDistance'),
  summaryTime:       document.getElementById('summaryTime'),
  summaryAvgSpeed:   document.getElementById('summaryAvgSpeed'),
  summaryMaxSpeed:   document.getElementById('summaryMaxSpeed'),
  btnSaveWorkout:    document.getElementById('btnSaveWorkout'),
  btnDiscardWorkout: document.getElementById('btnDiscardWorkout'),

  /* Тост-контейнер */
  toastContainer: document.getElementById('toastContainer'),
};

/* ══════════════════════════════════════════════════════
   §3. ИНИЦИАЛИЗАЦИЯ
   ══════════════════════════════════════════════════════ */

function initApp() {
  console.log('[VeloTrack] Инициализация v2.0 🚴');

  loadHistory();
  renderHistory();
  bindEvents();
  registerServiceWorker();

  // Выводим подсказку о симуляторе в консоль
  printSimulatorHelp();

  console.log('[VeloTrack] Готов. Нажми СТАРТ или запусти симулятор из консоли.');
}

/* ══════════════════════════════════════════════════════
   §4. ОБРАБОТЧИКИ СОБЫТИЙ
   ══════════════════════════════════════════════════════ */

function bindEvents() {
  DOM.btnMain.addEventListener('click', onMainBtn);
  DOM.btnReset.addEventListener('click', onResetBtn);
  DOM.btnHistory.addEventListener('click', () => {
    DOM.historySection.scrollIntoView({ behavior: 'smooth' });
  });

  DOM.clearHistoryBtn.addEventListener('click', onClearHistory);
  DOM.clearHistoryBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') onClearHistory();
  });

  DOM.btnSaveWorkout.addEventListener('click', onSaveWorkout);
  DOM.btnDiscardWorkout.addEventListener('click', onDiscardWorkout);

  // Закрытие модалки кликом по оверлею
  DOM.summaryModal.addEventListener('click', (e) => {
    if (e.target === DOM.summaryModal) onDiscardWorkout();
  });
}

/* ══════════════════════════════════════════════════════
   §5. МАШИНА СОСТОЯНИЙ — главная кнопка

   СТАРТ (idle)
     │ click
     ▼
   ПАУЗА (running) ────── [кнопка ПАУЗА]
     │                         │
     │ click                   ▼
     │               СТОП (paused) / ПРОДОЛЖИТЬ
     ▼
   СТОП (→ idle, показ сводки)

   Визуальная схема кнопок:
   idle    → зелёная   «▶ СТАРТ»
   running → жёлтая    «⏸ ПАУЗА»  (по ТЗ: жёлтая во время езды)
   paused  → красная   «⏹ СТОП»   (по ТЗ: красная на паузе)
   ══════════════════════════════════════════════════════ */

function onMainBtn() {
  switch (State.workoutStatus) {
    case 'idle':    startWorkout();  break;
    case 'running': pauseWorkout();  break;
    case 'paused':  stopWorkout();   break;   // второй клик на стоп
  }
}

function onResetBtn() {
  if (State.workoutStatus === 'idle') return;
  stopWorkout();
}

/* ── СТАРТ ──────────────────────────────────────────── */

function startWorkout() {
  console.log('[Workout] ▶ Старт');

  State.workoutStatus = 'running';
  State.startTime     = Date.now() - State.pausedAt;

  _startTimer();
  _startGPS();
  _requestWakeLock();

  setBtn('pause');                      // кнопка → жёлтая ПАУЗА
  setStatsActive(true);
  setGPSBadge('searching');
  DOM.btnReset.disabled = false;
}

/* ── ПАУЗА ──────────────────────────────────────────── */

function pauseWorkout() {
  console.log('[Workout] ⏸ Пауза');

  State.workoutStatus = 'paused';
  State.pausedAt      = Date.now() - State.startTime;  // сохраняем сколько прошло

  _stopTimer();
  // GPS НЕ останавливаем — чтобы не потерять сигнал и не ждать повторного захвата
  // Но перестаём учитывать дистанцию (проверка State.workoutStatus === 'running')

  State.currentSpeed = 0;     // визуально скорость = 0 пока стоим
  updateUI();

  setBtn('stop');              // кнопка → красная СТОП
  setGPSBadge('ok');          // GPS ещё слушает
  showToast('⏸ Тренировка на паузе', 'warning');
}

/* ── СТОП (финал) ───────────────────────────────────── */

function stopWorkout() {
  console.log('[Workout] ⏹ Стоп');

  State.workoutStatus = 'idle';

  _stopTimer();
  _stopGPS();
  _stopSimulator();
  _releaseWakeLock();

  setBtn('start');
  setStatsActive(false);
  DOM.btnReset.disabled = true;
  setGPSBadge('off');

  // Показываем сводку только если тренировка длилась хоть что-то
  if (State.pausedAt > 3000 || State.totalDistance > 5) {
    showSummaryModal();
  } else {
    showToast('⚠ Тренировка слишком коротка', 'warning');
    resetWorkoutData();
    updateUI();
  }
}

/* ══════════════════════════════════════════════════════
   §6. ТАЙМЕР
   ══════════════════════════════════════════════════════ */

function _startTimer() {
  _stopTimer();  // защита от двойного запуска
  State.timerInterval = setInterval(_timerTick, 1000);
}

function _stopTimer() {
  if (State.timerInterval) {
    clearInterval(State.timerInterval);
    State.timerInterval = null;
  }
}

/**
 * Тик таймера — вызывается каждую секунду.
 * Вычисляет elapsed из разницы timestamp-ов, а не накапливает +1,
 * чтобы не было дрейфа при длинных тренировках.
 */
function _timerTick() {
  const elapsed = Date.now() - State.startTime;  // мс
  const seconds = Math.floor(elapsed / 1000);

  // Пересчитываем калории раз в секунду (дёшево)
  State.calories = _calcCalories(seconds);

  _renderTime(seconds);
  _renderCalories();
  _renderAvgSpeed();
}

/* ══════════════════════════════════════════════════════
   §7. GPS / ГЕОЛОКАЦИЯ
   ══════════════════════════════════════════════════════ */

const GPS_OPTIONS = {
  enableHighAccuracy: true,   // GPS-чип, не WiFi/IP
  timeout:            15000,  // ждём до 15 сек
  maximumAge:         0,      // всегда свежие данные
};

/**
 * Запустить watchPosition.
 * Сначала делаем быстрый getCurrentPosition чтобы немедленно получить
 * первую точку, затем watchPosition для непрерывного обновления.
 */
function _startGPS() {
  if (!('geolocation' in navigator)) {
    showToast('❌ Геолокация не поддерживается браузером', 'error');
    setGPSBadge('error');
    return;
  }

  // getCurrentPosition — быстрый первый фикс
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      console.log('[GPS] Первый фикс получен ✓');
      _onGPSUpdate(pos);
      setGPSBadge('ok');
    },
    (err) => {
      console.warn('[GPS] getCurrentPosition ошибка:', err.message);
      _onGPSError(err);
    },
    GPS_OPTIONS
  );

  // watchPosition — непрерывное слежение
  State.watchId = navigator.geolocation.watchPosition(
    _onGPSUpdate,
    _onGPSError,
    GPS_OPTIONS
  );

  console.log('[GPS] watchPosition запущен, id:', State.watchId);
}

function _stopGPS() {
  if (State.watchId !== null) {
    navigator.geolocation.clearWatch(State.watchId);
    State.watchId = null;
    console.log('[GPS] watchPosition остановлен');
  }
  State.previousPosition = null;
  State.rawSpeedBuffer   = [];
}

/* ── Успешный GPS-апдейт ──────────────────────────────
   Это сердце трекера — вызывается каждый раз когда
   браузер получает новые координаты (обычно 1-5 сек).
   ─────────────────────────────────────────────────── */

function _onGPSUpdate(position) {
  const { latitude: lat, longitude: lon, speed: rawSpeedMps, accuracy } = position.coords;
  const ts = position.timestamp;

  console.log(
    `[GPS] lat=${lat.toFixed(6)} lon=${lon.toFixed(6)} ` +
    `speed=${rawSpeedMps !== null ? rawSpeedMps.toFixed(2) : 'n/a'} m/s ` +
    `acc=±${accuracy.toFixed(0)}м`
  );

  setGPSBadge('ok');

  /* ① Вычисляем сырую скорость в км/ч ─────────────────
     Приоритет: coords.speed (нативный GPS-акселерометр)
     Если недоступен — считаем по двум точкам (Δd / Δt).  */
  let rawKmh = 0;

  if (rawSpeedMps !== null && rawSpeedMps >= 0) {
    // Нативная скорость GPS — самая точная
    rawKmh = rawSpeedMps * 3.6;
  } else if (State.previousPosition) {
    // Fallback: считаем скорость из позиций
    rawKmh = _speedFromPositions(State.previousPosition, { lat, lon, ts });
  }

  /* ② Сглаживание скорости — скользящее среднее ───────
     Кольцевой буфер SPEED_SMOOTH_SAMPLES последних значений.
     Убирает резкие скачки (GPS-джиттер на стоянках и т.п.)  */
  State.rawSpeedBuffer.push(rawKmh);
  if (State.rawSpeedBuffer.length > SPEED_SMOOTH_SAMPLES) {
    State.rawSpeedBuffer.shift();
  }
  const smoothedKmh = _average(State.rawSpeedBuffer);

  // Фильтр аномальных значений
  State.currentSpeed = Math.min(smoothedKmh, MAX_SPEED_KMH);

  /* ③ Максимальная скорость ────────────────────────── */
  if (State.currentSpeed > State.maxSpeed) {
    State.maxSpeed = State.currentSpeed;
  }

  /* ④ Дистанция — считаем только при АКТИВНОМ трекинге
     (на паузе не считаем, GPS просто слушает)           */
  if (State.workoutStatus === 'running' && State.previousPosition) {
    const segmentM = _haversineMeters(
      State.previousPosition.lat, State.previousPosition.lon,
      lat, lon
    );

    // Фильтруем нереалистичные «прыжки» позиции
    if (segmentM <= MAX_SEGMENT_M) {
      State.totalDistance += segmentM;
    } else {
      console.warn(`[GPS] Прыжок позиции ${segmentM.toFixed(0)}м — пропущен`);
    }
  }

  /* ⑤ Сохраняем текущую точку как предыдущую ──────── */
  State.previousPosition = { lat, lon, ts };

  /* ⑥ Обновляем всё что связано со скоростью и дистанцией */
  _renderSpeed();
  _renderDistance();
}

/* ── GPS-ошибка ─────────────────────────────────────── */

function _onGPSError(error) {
  const MESSAGES = {
    1: '🔒 Нет доступа к GPS. Разрешите геолокацию в браузере.',
    2: '📡 GPS-сигнал недоступен. Выйдите на улицу.',
    3: '⏱ GPS не отвечает. Повторная попытка...',
  };

  console.warn('[GPS] Ошибка:', error.code, error.message);
  setGPSBadge('error');

  // При ошибке TIMEOUT (3) продолжаем — watchPosition сам повторит
  if (error.code !== 3) {
    showToast(MESSAGES[error.code] || '❌ GPS ошибка', 'error', 5000);
  }
}

/* ══════════════════════════════════════════════════════
   §8. МАТЕМАТИКА / ГЕОДЕЗИЯ
   ══════════════════════════════════════════════════════ */

/**
 * Формула Гаверсинусов.
 * Возвращает расстояние в МЕТРАХ между двумя GPS-точками.
 * Точность: <0.5% для расстояний до 10 км (более чем достаточно).
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} метры
 */
function _haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6_371_000; // радиус Земли в метрах
  const φ1 = _toRad(lat1);
  const φ2 = _toRad(lat2);
  const Δφ = _toRad(lat2 - lat1);
  const Δλ = _toRad(lon2 - lon1);

  const a = Math.sin(Δφ / 2) ** 2
          + Math.cos(φ1) * Math.cos(φ2)
          * Math.sin(Δλ / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Вычисление скорости между двумя точками (когда coords.speed недоступен).
 * @param {{ lat, lon, ts }} prev
 * @param {{ lat, lon, ts }} curr
 * @returns {number} скорость в км/ч
 */
function _speedFromPositions(prev, curr) {
  const distM   = _haversineMeters(prev.lat, prev.lon, curr.lat, curr.lon);
  const dtSec   = (curr.ts - prev.ts) / 1000;

  if (dtSec <= 0 || dtSec > 60) return 0;  // подозрительный интервал

  const kmh = (distM / dtSec) * 3.6;
  return Math.min(kmh, MAX_SPEED_KMH);
}

/**
 * Средняя скорость за всю тренировку.
 * totalDistance (м) / elapsed (сек) → м/с → км/ч
 */
function _avgSpeedKmh() {
  const elapsed = _elapsedSeconds();
  if (elapsed <= 0 || State.totalDistance <= 0) return 0;
  return (State.totalDistance / elapsed) * 3.6;
}

/**
 * Расчёт калорий — формула MET × вес × часы.
 * MET меняется в зависимости от средней скорости.
 */
function _calcCalories(seconds) {
  const hours = seconds / 3600;
  const avg   = _avgSpeedKmh();

  // MET для езды на велосипеде (по данным Compendium of Physical Activities)
  let met = 4.0;                   // <12 км/ч, очень лёгко
  if (avg >= 12) met = 6.8;        // 12–16 км/ч, умеренно
  if (avg >= 16) met = 8.0;        // 16–19 км/ч
  if (avg >= 19) met = 10.0;       // 19–22 км/ч
  if (avg >= 22) met = 12.0;       // 22–25 км/ч, интенсивно
  if (avg >= 25) met = 14.0;       // >25 км/ч, гонка

  return Math.round(met * State.userWeightKg * hours);
}

/** Сколько секунд прошло с начала тренировки (с учётом паузы) */
function _elapsedSeconds() {
  if (!State.startTime) return 0;
  return Math.floor((Date.now() - State.startTime) / 1000);
}

/** Среднее арифметическое массива чисел */
function _average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Градусы → радианы */
function _toRad(deg) { return deg * Math.PI / 180; }

/* ══════════════════════════════════════════════════════
   §9. ОТРИСОВКА UI (Render-функции)

   Каждая функция отвечает за один элемент.
   Чёткое разделение — легко дебажить.
   ══════════════════════════════════════════════════════ */

/** Перерисовать всё (вызывается при сбросе) */
function updateUI() {
  _renderSpeed();
  _renderDistance();
  _renderTime(_elapsedSeconds());
  _renderAvgSpeed();
  _renderMaxSpeed();
  _renderCalories();
}

/** Спидометр — большие цифры + полоска */
function _renderSpeed() {
  const kmh = State.currentSpeed;
  const rounded = Math.round(kmh);

  DOM.speedValue.textContent = rounded;

  // Неоновый эффект — только когда едем
  DOM.speedValue.classList.toggle('active', kmh > 0.5);

  // Полоска скорости: 0–40 км/ч → 0–100%
  // После 40 км/ч — 100% (красная зона)
  const pct = Math.min((kmh / 40) * 100, 100);
  DOM.speedBarFill.style.width = pct + '%';

  // Меняем цвет полоски в зависимости от зоны скорости
  if (kmh < 15) {
    DOM.speedBarFill.style.background = 'linear-gradient(90deg, #00b4ff, #00ff88)';
  } else if (kmh < 28) {
    DOM.speedBarFill.style.background = 'linear-gradient(90deg, #00ff88, #ffb800)';
  } else {
    DOM.speedBarFill.style.background = 'linear-gradient(90deg, #ffb800, #ff2d55)';
  }
}

/** Дистанция в карточке */
function _renderDistance() {
  const km = State.totalDistance / 1000;
  DOM.distanceValue.textContent = km.toFixed(2);
}

/** Таймер в карточке */
function _renderTime(seconds) {
  DOM.timeValue.textContent = _formatTime(seconds);
}

/** Средняя скорость в карточке */
function _renderAvgSpeed() {
  DOM.avgSpeedValue.textContent = _avgSpeedKmh().toFixed(1);
}

/** Максимальная скорость */
function _renderMaxSpeed() {
  DOM.maxSpeedValue.innerHTML =
    State.maxSpeed.toFixed(1) +
    ' <small style="color:var(--text-muted);font-size:.65rem">км/ч</small>';
}

/** Калории */
function _renderCalories() {
  DOM.caloriesValue.innerHTML =
    State.calories +
    ' <small style="color:var(--text-muted);font-size:.65rem">ккал</small>';
}

/* ══════════════════════════════════════════════════════
   §10. UI-ХЕЛПЕРЫ (кнопка, бейджи, тосты)
   ══════════════════════════════════════════════════════ */

/**
 * Переключение состояния главной кнопки.
 *
 * 'start'  → зелёная  «▶ СТАРТ»      (idle)
 * 'pause'  → жёлтая   «⏸ ПАУЗА»     (running — ТЗ: жёлтая)
 * 'stop'   → красная  «⏹ СТОП»      (paused  — ТЗ: красная)
 *
 * @param {'start'|'pause'|'stop'} state
 */
function setBtn(state) {
  DOM.btnMain.classList.remove('btn-start', 'btn-pause', 'btn-stop', 'btn-resume');

  const CONFIG = {
    start: { cls: 'btn-start', icon: '▶', label: 'СТАРТ',      aria: 'Начать тренировку'            },
    pause: { cls: 'btn-pause', icon: '⏸', label: 'ПАУЗА',      aria: 'Поставить на паузу'           },
    stop:  { cls: 'btn-stop',  icon: '⏹', label: 'СТОП',       aria: 'Завершить и сохранить'        },
  };

  const cfg = CONFIG[state] || CONFIG.start;
  DOM.btnMain.classList.add(cfg.cls);
  DOM.btnIcon.textContent  = cfg.icon;
  DOM.btnLabel.textContent = cfg.label;
  DOM.btnMain.setAttribute('aria-label', cfg.aria);
}

/**
 * GPS-бейдж в шапке приложения.
 * @param {'off'|'searching'|'ok'|'error'} status
 */
function setGPSBadge(status) {
  State.gpsStatus = status;

  DOM.statusBadge.className = 'status-badge';

  const MAP = {
    off:       { cls: '',         text: 'Ожидание'   },
    searching: { cls: 'searching',text: 'Поиск GPS'  },
    ok:        { cls: 'active',   text: 'GPS активен'},
    error:     { cls: 'error',    text: 'GPS ошибка' },
  };

  const cfg = MAP[status] || MAP.off;
  if (cfg.cls) DOM.statusBadge.classList.add(cfg.cls);
  DOM.statusText.textContent = cfg.text;
}

/**
 * Включить/выключить CSS-анимации карточек статистики.
 * @param {boolean} active
 */
function setStatsActive(active) {
  [DOM.cardDistance, DOM.cardTime, DOM.cardAvgSpeed].forEach(el =>
    el.classList.toggle('active', active)
  );
  [DOM.distanceValue, DOM.timeValue, DOM.avgSpeedValue].forEach(el =>
    el.classList.toggle('active', active)
  );
}

/**
 * Toast-уведомление снизу экрана.
 * @param {string} msg
 * @param {'success'|'warning'|'error'|''} type
 * @param {number} durationMs
 */
function showToast(msg, type = '', durationMs = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = msg;
  el.setAttribute('role', 'alert');
  DOM.toastContainer.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'toast-in 0.3s ease reverse both';
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}

/* ══════════════════════════════════════════════════════
   §11. МОДАЛЬНОЕ ОКНО СВОДКИ ТРЕНИРОВКИ
   ══════════════════════════════════════════════════════ */

function showSummaryModal() {
  DOM.summaryDistance.textContent = (State.totalDistance / 1000).toFixed(2);
  DOM.summaryTime.textContent     = _formatTime(_elapsedSeconds());
  DOM.summaryAvgSpeed.textContent = _avgSpeedKmh().toFixed(1);
  DOM.summaryMaxSpeed.textContent = State.maxSpeed.toFixed(1);

  DOM.summaryModal.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function hideSummaryModal() {
  DOM.summaryModal.classList.remove('visible');
  document.body.style.overflow = '';
}

function onSaveWorkout() {
  _saveWorkoutToHistory();
  hideSummaryModal();
  resetWorkoutData();
  updateUI();
  renderHistory();
  showToast('✅ Тренировка сохранена!', 'success');
}

function onDiscardWorkout() {
  hideSummaryModal();
  resetWorkoutData();
  updateUI();
  showToast('Тренировка удалена', 'warning');
}

/* ══════════════════════════════════════════════════════
   §12. ИСТОРИЯ ТРЕНИРОВОК (localStorage)
   ══════════════════════════════════════════════════════ */

const STORAGE_KEY = 'velotrack_v2_workouts';

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    State.history = raw ? JSON.parse(raw) : [];
  } catch {
    State.history = [];
  }
}

function _saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(State.history));
  } catch (e) {
    console.warn('[Storage] Ошибка записи:', e);
  }
}

function _saveWorkoutToHistory() {
  const w = {
    id:       Date.now(),
    date:     new Date().toLocaleDateString('ru-RU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }),
    distanceM:  State.totalDistance,
    durationS:  _elapsedSeconds(),
    avgSpeedKmh: _avgSpeedKmh(),
    maxSpeedKmh: State.maxSpeed,
    calories:    State.calories,
  };

  State.history.unshift(w);
  if (State.history.length > 50) State.history.pop();
  _saveToStorage();
}

function renderHistory() {
  if (!State.history.length) {
    DOM.historyEmpty.style.display = '';
    DOM.historyList.innerHTML = '';
    return;
  }

  DOM.historyEmpty.style.display = 'none';
  DOM.historyList.innerHTML = State.history.map(w => `
    <div class="history-item" role="listitem" data-id="${w.id}">
      <div class="history-item-icon">🚴</div>
      <div class="history-item-info">
        <div class="history-item-date">${w.date}</div>
        <div class="history-item-stats">
          <div class="history-stat">${(w.distanceM / 1000).toFixed(2)}<span>км</span></div>
          <div class="history-stat">${_formatTime(w.durationS)}</div>
          <div class="history-stat">${w.avgSpeedKmh.toFixed(1)}<span>км/ч</span></div>
        </div>
      </div>
    </div>
  `).join('');
}

function onClearHistory() {
  if (!State.history.length) return;
  State.history = [];
  _saveToStorage();
  renderHistory();
  showToast('История очищена', 'warning');
}

/* ══════════════════════════════════════════════════════
   §13. СБРОС ДАННЫХ ТРЕНИРОВКИ
   ══════════════════════════════════════════════════════ */

function resetWorkoutData() {
  State.workoutStatus    = 'idle';
  State.startTime        = null;
  State.pausedAt         = 0;
  State.totalDistance    = 0;
  State.currentSpeed     = 0;
  State.maxSpeed         = 0;
  State.calories         = 0;
  State.previousPosition = null;
  State.rawSpeedBuffer   = [];
}

/* ══════════════════════════════════════════════════════
   §14. WAKE LOCK API
   ══════════════════════════════════════════════════════ */

async function _requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    State.wakeLock = await navigator.wakeLock.request('screen');
    console.log('[WakeLock] Захвачен — экран не погаснет');
    State.wakeLock.addEventListener('release', () => {
      console.log('[WakeLock] Освобождён');
    });
    document.addEventListener('visibilitychange', _onVisibilityChange);
  } catch (e) {
    console.warn('[WakeLock] Ошибка:', e.message);
  }
}

async function _releaseWakeLock() {
  if (State.wakeLock) {
    await State.wakeLock.release();
    State.wakeLock = null;
    document.removeEventListener('visibilitychange', _onVisibilityChange);
  }
}

async function _onVisibilityChange() {
  if (document.visibilityState === 'visible' && State.workoutStatus === 'running') {
    await _requestWakeLock();
  }
}

/* ══════════════════════════════════════════════════════
   §15. GPS-СИМУЛЯТОР (для тестирования без реального GPS)

   Активируется из консоли браузера (F12):

     VeloSim.start()           — старт симуляции (авто-стартует тренировку)
     VeloSim.start(8)          — 8 м/с ≈ 29 км/ч
     VeloSim.stop()            — стоп симулятора
     VeloSim.setSpeed(12)      — изменить скорость в м/с на ходу
     VeloSim.jogRoute()        — медленная городская поездка
     VeloSim.sprintRoute()     — высокоскоростная трасса
     VeloSim.mountainRoute()   — горная с переменной скоростью

   ══════════════════════════════════════════════════════

   Симулятор движет «велосипедиста» по прямой,
   периодически меняя направление (имитация поворотов).
   Каждые 2 секунды создаётся фейковый GeolocationPosition
   и передаётся в _onGPSUpdate() — тот же обработчик, что
   и для реального GPS. Код трекера не знает разницы.
   ══════════════════════════════════════════════════════ */

/** Создать фейковый GeolocationPosition-подобный объект */
function _makeFakePosition(lat, lon, speedMps) {
  return {
    timestamp: Date.now(),
    coords: {
      latitude:         lat,
      longitude:        lon,
      altitude:         null,
      accuracy:         5,          // ±5 м — хорошая точность
      altitudeAccuracy: null,
      heading:          State.simHeading,
      speed:            speedMps,   // м/с — нативная скорость GPS
    },
  };
}

/** Двигаем симулируемую точку на distM метров в направлении heading */
function _movePosition(lat, lon, heading, distM) {
  const R = 6_371_000;
  const δ = distM / R;
  const θ = _toRad(heading);
  const φ1 = _toRad(lat);
  const λ1 = _toRad(lon);

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );

  return {
    lat: φ2 * 180 / Math.PI,
    lon: ((λ2 * 180 / Math.PI) + 540) % 360 - 180, // нормализация
  };
}

/** Остановка симулятора (внутренняя) */
function _stopSimulator() {
  if (State.simInterval) {
    clearInterval(State.simInterval);
    State.simInterval = null;
    console.log('[Simulator] Остановлен');
  }
}

/** Тик симулятора — каждые 2 секунды */
function _simTick() {
  // Слегка виляем направлением (±15° случайно)
  State.simHeading = (State.simHeading + (Math.random() * 30 - 15) + 360) % 360;

  // Небольшой разброс скорости (±0.5 м/с — имитация педалирования)
  const jitter = (Math.random() - 0.5) * 1.0;
  const speedMps = Math.max(0.5, State.simSpeedMps + jitter);

  // Расстояние за 2 секунды
  const distM = speedMps * 2;

  // Двигаем позицию
  const next = _movePosition(State.simLat, State.simLon, State.simHeading, distM);
  State.simLat = next.lat;
  State.simLon = next.lon;

  // Создаём фейковую позицию и скармливаем обработчику
  const fakePos = _makeFakePosition(State.simLat, State.simLon, speedMps);
  _onGPSUpdate(fakePos);
}

/**
 * Публичный API симулятора — доступен из консоли как window.VeloSim
 */
const VeloSim = window.VeloSim = {
  /**
   * Запустить симуляцию.
   * @param {number} [speedMps=5.5] — скорость в м/с (5.5 ≈ 20 км/ч)
   */
  start(speedMps = 5.5) {
    if (State.simInterval) {
      console.warn('[Simulator] Уже запущен. Вызови VeloSim.stop() сначала.');
      return;
    }

    State.simSpeedMps = speedMps;
    console.log(
      `[Simulator] ▶ Старт симуляции ${(speedMps * 3.6).toFixed(1)} км/ч`,
      '\nВыключить: VeloSim.stop()'
    );

    // Если тренировка не запущена — стартуем её автоматически
    if (State.workoutStatus === 'idle') {
      // Запускаем тренировку, но без реального GPS
      State.workoutStatus = 'running';
      State.startTime     = Date.now() - State.pausedAt;
      _startTimer();
      _requestWakeLock();
      setBtn('pause');
      setStatsActive(true);
      setGPSBadge('ok');
      DOM.btnReset.disabled = false;
      showToast('🎮 Симуляция запущена!', 'success');
    }

    State.simInterval = setInterval(_simTick, 2000);
    _simTick(); // первый тик сразу
  },

  /** Остановить симуляцию */
  stop() {
    _stopSimulator();
    console.log('[Simulator] ⏹ Остановлен');
    showToast('🎮 Симуляция остановлена', 'warning');
  },

  /**
   * Изменить скорость на ходу.
   * @param {number} speedMps — м/с
   */
  setSpeed(speedMps) {
    State.simSpeedMps = speedMps;
    console.log(`[Simulator] Скорость изменена: ${(speedMps * 3.6).toFixed(1)} км/ч`);
  },

  /** Сценарий: городская прогулка (10–18 км/ч) */
  jogRoute() {
    console.log('[Simulator] 🏙 Городская поездка: 10–18 км/ч');
    this.start(3.5);  // ~12.6 км/ч
    const speeds = [2.8, 4.2, 3.0, 5.0, 2.5, 4.8, 3.5];
    let i = 0;
    const timer = setInterval(() => {
      if (!State.simInterval) { clearInterval(timer); return; }
      this.setSpeed(speeds[i % speeds.length]);
      i++;
    }, 8000);
  },

  /** Сценарий: спринт/шоссе (28–38 км/ч) */
  sprintRoute() {
    console.log('[Simulator] ⚡ Спринт: 28–38 км/ч');
    this.start(9.0);  // ~32.4 км/ч
    const speeds = [8.5, 10.2, 9.8, 8.0, 10.5, 9.0, 11.0];
    let i = 0;
    const timer = setInterval(() => {
      if (!State.simInterval) { clearInterval(timer); return; }
      this.setSpeed(speeds[i % speeds.length]);
      i++;
    }, 5000);
  },

  /** Сценарий: горная поездка (переменная скорость, подъёмы/спуски) */
  mountainRoute() {
    console.log('[Simulator] ⛰ Горная трасса: переменная скорость');
    this.start(4.0);
    // Имитируем подъём: замедление, потом спуск: ускорение
    const profile = [2.5, 2.0, 1.8, 2.2, 2.8, 5.0, 7.5, 9.0, 8.5, 6.0, 4.0, 3.5];
    let i = 0;
    const timer = setInterval(() => {
      if (!State.simInterval) { clearInterval(timer); return; }
      this.setSpeed(profile[i % profile.length]);
      i++;
    }, 6000);
  },

  /** Статус симулятора */
  status() {
    const running = !!State.simInterval;
    console.log(
      `[Simulator] ${running ? '▶ ЗАПУЩЕН' : '⏹ ОСТАНОВЛЕН'}`,
      `\nСкорость: ${(State.simSpeedMps * 3.6).toFixed(1)} км/ч`,
      `\nПозиция: lat=${State.simLat.toFixed(6)} lon=${State.simLon.toFixed(6)}`
    );
  },
};

/** Справка в консоль при старте */
function printSimulatorHelp() {
  console.groupCollapsed('%c[VeloTrack] 🎮 GPS-Симулятор доступен', 'color:#00ff88;font-weight:bold');
  console.log(
    '%cКоманды в консоли (F12):',
    'color:#ffb800;font-weight:bold',
    '\n\nVeloSim.start()         — старт (20 км/ч)',
    '\nVeloSim.start(8)        — старт с 28.8 км/ч',
    '\nVeloSim.stop()          — стоп',
    '\nVeloSim.setSpeed(6)     — изменить скорость (м/с)',
    '\nVeloSim.jogRoute()      — городская (10–18 км/ч)',
    '\nVeloSim.sprintRoute()   — шоссе (28–38 км/ч)',
    '\nVeloSim.mountainRoute() — горная (переменная)',
    '\nVeloSim.status()        — текущее состояние',
  );
  console.groupEnd();
}

/* ══════════════════════════════════════════════════════
   §16. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ══════════════════════════════════════════════════════ */

/**
 * Форматирование секунд → "ММ:СС" или "ЧЧ:ММ:СС"
 * @param {number} totalSec
 * @returns {string}
 */
function _formatTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${_p(h)}:${_p(m)}:${_p(s)}`;
  return `${_p(m)}:${_p(s)}`;
}

/** Добавить ведущий ноль */
function _p(n) { return String(n).padStart(2, '0'); }

/* ══════════════════════════════════════════════════════
   §17. SERVICE WORKER (PWA)
   ══════════════════════════════════════════════════════ */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('./service-worker.js', { scope: './' })
    .then((reg) => {
      console.log('[SW] Зарегистрирован, scope:', reg.scope);

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('🔄 Доступно обновление. Перезагрузите страницу.', 'warning', 8000);
          }
        });
      });
    })
    .catch(err => console.error('[SW] Ошибка регистрации:', err));
}

/* ══════════════════════════════════════════════════════
   §18. ДОБАВЛЯЕМ CSS для кнопки СТОП (если не добавлен)
   ══════════════════════════════════════════════════════
   Кнопка СТОП — красная (по ТЗ).
   Кнопка ПАУЗА — жёлтая/янтарная (по ТЗ: жёлтая при езде).
   Инжектируем стиль программно, чтобы не трогать style.css.
   ══════════════════════════════════════════════════════ */
(function injectButtonStyles() {
  if (document.getElementById('vt-btn-styles')) return;

  const style = document.createElement('style');
  style.id = 'vt-btn-styles';
  style.textContent = `
    /* ПАУЗА — янтарно-жёлтая (тренировка идёт) */
    .btn-pause {
      background: linear-gradient(135deg, #e07a00 0%, #ffb800 50%, #e07a00 100%) !important;
      color: #1a0f00 !important;
      box-shadow: 0 4px 32px rgba(255,184,0,0.5), 0 2px 8px rgba(0,0,0,0.5) !important;
    }
    .btn-pause:hover {
      box-shadow: 0 6px 44px rgba(255,184,0,0.65), 0 2px 8px rgba(0,0,0,0.5) !important;
    }

    /* СТОП — красная (на паузе, чтобы не перепутать с продолжить) */
    .btn-stop {
      background: linear-gradient(135deg, #c01530 0%, #ff2d55 50%, #c01530 100%) !important;
      color: #fff0f3 !important;
      box-shadow: 0 4px 32px rgba(255,45,85,0.5), 0 2px 8px rgba(0,0,0,0.5) !important;
    }
    .btn-stop:hover {
      box-shadow: 0 6px 44px rgba(255,45,85,0.65), 0 2px 8px rgba(0,0,0,0.5) !important;
    }

    /* Статус GPS — error */
    .status-badge.error .status-dot {
      background: #ff2d55 !important;
      animation: blink 0.8s ease-in-out infinite !important;
    }
    .status-badge.error {
      border-color: rgba(255,45,85,0.4) !important;
      color: #ff2d55 !important;
    }
  `;
  document.head.appendChild(style);
})();

/* ══════════════════════════════════════════════════════
   §19. ТОЧКА ВХОДА
   ══════════════════════════════════════════════════════ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Явно пробрасываем симулятор в глобальную область —
// на случай если SW отдал кешированную версию или
// браузер ограничивает видимость через strict mode.
// Теперь VeloSim гарантированно доступен из F12-консоли.
window.VeloSim = VeloSim;
