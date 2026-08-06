import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 200 }, // ramp up to 200 users
    { duration: '1m', target: 1000 }, // spike to 1000 users
    { duration: '30s', target: 0 },   // ramp down
  ],
};

export default function () {
  // Use a generated dummy token assuming auth middleware verifies it or we hit health check
  const res = http.get('http://localhost/api/v1/health');
  
  check(res, {
    'is status 200': (r) => r.status === 200,
    'latency < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
