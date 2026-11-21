import http from 'k6/http';
import { check } from 'k6';

const profile = JSON.parse(open('./profile.json'));
const targetUrl = __ENV.TARGET_URL ?? 'http://nginx:8080';

// Под перегрузкой ответ упирается в потолок балансировщика: 5 с на экземпляр,
// два экземпляра. Итерация держит VU до десяти секунд, отсюда и запас в
// rate x VU_SECONDS. Если VU не хватит, k6 отбросит часть итераций, и замер
// будет снят не с той нагрузки, которая объявлена в профиле.
const VU_SECONDS = 12;

const scenario = (name: string, rate: number, startTime: string) => ({
  executor: 'constant-arrival-rate',
  exec: name,
  rate,
  timeUnit: '1s',
  duration: profile.stand.duration,
  startTime,
  // Пул выделяется целиком заранее. k6 отбрасывает итерацию сразу, если
  // свободного VU нет в этот момент, а доращивает пул уже потом, и за 30 секунд
  // прогона не успевает.
  preAllocatedVUs: Math.ceil(rate * VU_SECONDS),
  maxVUs: Math.ceil(rate * VU_SECONDS) + 50,
  gracefulStop: '5s',
});

export const options = {
  scenarios: {
    warmup: {
      executor: 'constant-arrival-rate',
      exec: 'read',
      rate: 5,
      timeUnit: '1s',
      duration: profile.stand.warmup,
      preAllocatedVUs: 60,
      maxVUs: 110,
    },
    orders: scenario('order', profile.stand.orderRate, profile.stand.warmup),
    reads: scenario('read', profile.stand.readRate, profile.stand.warmup),
    history: scenario('history', profile.stand.historyRate, profile.stand.warmup),
  },
  thresholds: {
    // Базовый прогон должен завершиться и записать нарушение цели.
    'http_req_duration{scenario:history}': ['p(95)<30000'],
    http_req_failed: [`rate<=${profile.targets.errorRate}`],
    dropped_iterations: ['count==0'],
  },
};

export const read = () => {
  const response = http.get(`${targetUrl}/trips/1`);
  check(response, { 'trip is read': (result) => result.status === 200 });
};

export const order = () => {
  const key = `load-${__VU}-${__ITER}-${Date.now()}`;
  const response = http.post(
    `${targetUrl}/trips`,
    JSON.stringify({
      passengerId: 1 + (__VU % 1000),
      pickupAddress: 'улица Лесная, 10',
      destinationAddress: 'улица Садовая, 5',
    }),
    { headers: { 'content-type': 'application/json', 'idempotency-key': key } },
  );
  check(response, { 'trip is created': (result) => result.status === 201 });
};

export const history = () => {
  const passengerId = 1 + (__VU % 1000);
  const response = http.get(`${targetUrl}/passengers/${passengerId}/trips`);
  check(response, { 'history is read': (result) => result.status === 200 });
};
