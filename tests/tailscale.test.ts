import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMappingForUrl,
  parseServeConfig,
  parseTailscaleStatus,
  proxyPort,
  tailnetUrl,
} from '../src/lib/tailscale.js';

const STATUS = {
  BackendState: 'Running',
  Self: {
    DNSName: 'desktop-4hh39kc.tail6c4fd2.ts.net.',
    TailscaleIPs: ['100.77.130.111', 'fd7a:115c:a1e0::f13a:8270'],
  },
};

const SERVE = {
  TCP: { '443': { HTTPS: true } },
  Web: {
    'desktop-4hh39kc.tail6c4fd2.ts.net:443': {
      Handlers: { '/': { Proxy: 'http://127.0.0.1:8080' } },
    },
  },
  AllowFunnel: { 'desktop-4hh39kc.tail6c4fd2.ts.net:443': true },
};

test('tailscale: статус узла и DNS-имя без завершающей точки', () => {
  const status = parseTailscaleStatus(STATUS);
  assert.equal(status.available, true);
  assert.equal(status.backendState, 'Running');
  assert.equal(status.dnsName, 'desktop-4hh39kc.tail6c4fd2.ts.net');
  assert.deepEqual(status.ips, ['100.77.130.111', 'fd7a:115c:a1e0::f13a:8270']);
  assert.equal(tailnetUrl(status), 'https://desktop-4hh39kc.tail6c4fd2.ts.net');
});

test('tailscale: битые данные не ломают разбор', () => {
  assert.equal(parseTailscaleStatus(null).available, false);
  assert.deepEqual(parseServeConfig(null).mappings, []);
  assert.equal(parseTailscaleStatus({ BackendState: 'Stopped' }).dnsName, null);
});

test('tailscale: правило serve и режим Funnel', () => {
  const config = parseServeConfig(SERVE);
  assert.equal(config.mappings.length, 1);
  const mapping = config.mappings[0];
  assert.ok(mapping);
  assert.equal(mapping.host, 'desktop-4hh39kc.tail6c4fd2.ts.net:443');
  assert.equal(mapping.path, '/');
  assert.equal(mapping.target, 'http://127.0.0.1:8080');
  assert.equal(mapping.funnel, true);
});

test('tailscale: поиск правила по публичному URL', () => {
  const config = parseServeConfig(SERVE);
  const found = findMappingForUrl(config, 'https://desktop-4hh39kc.tail6c4fd2.ts.net');
  assert.equal(found?.target, 'http://127.0.0.1:8080');
  assert.equal(
    findMappingForUrl(config, 'https://desktop-4hh39kc.tail6c4fd2.ts.net:443')?.target,
    'http://127.0.0.1:8080',
  );
  assert.equal(findMappingForUrl(config, 'https://other.ts.net'), null);
  assert.equal(findMappingForUrl(config, 'не url'), null);
});

test('tailscale: порт из адреса прокси', () => {
  assert.equal(proxyPort('http://127.0.0.1:8080'), 8080);
  assert.equal(proxyPort('127.0.0.1:3000'), 3000);
  assert.equal(proxyPort('http://localhost'), 80);
  assert.equal(proxyPort('https://example.com'), 443);
  assert.equal(proxyPort(':::'), null);
});
