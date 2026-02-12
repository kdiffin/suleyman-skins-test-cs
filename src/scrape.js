import { mkdir, writeFile } from 'node:fs/promises';

const BASE_URL = 'https://csgoskins.gg';
const DISCOVERY_URL = `${BASE_URL}/`;
const PER_WEAPON_OUTPUT_DIR = new URL('../public/data/weapons/', import.meta.url);
const AGGREGATE_OUTPUT_PATH = new URL('../public/data/all-guns-under-20-azn.json', import.meta.url);
const LEGACY_SCAR_OUTPUT_PATH = new URL('../public/data/scar20-under-20-azn.json', import.meta.url);
const LIMIT_AZN = 20;
const FALLBACK_USD_TO_AZN = 1.7;

const EXCLUDED_WEAPON_SLUGS = new Set(['a']);
const EXCLUDED_WEAPON_PATTERNS = [/knife/i, /glove/i, /wrap/i, /bayonet/i];
const KNOWN_GUN_SLUGS = new Set([
  'ak-47',
  'aug',
  'awp',
  'cz75-auto',
  'desert-eagle',
  'dual-berettas',
  'famas',
  'five-seven',
  'g3sg1',
  'galil-ar',
  'glock-18',
  'm249',
  'm4a1-s',
  'm4a4',
  'mac-10',
  'mag-7',
  'mp5-sd',
  'mp7',
  'mp9',
  'negev',
  'nova',
  'p2000',
  'p250',
  'p90',
  'pp-bizon',
  'r8-revolver',
  'sawed-off',
  'scar-20',
  'sg-553',
  'ssg-08',
  'tec-9',
  'ump-45',
  'usp-s',
  'xm1014',
  'zeus-x27'
]);

function extractJsonLdObjects(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const objects = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      objects.push(JSON.parse(raw));
    } catch {
      // ignore invalid json-ld chunks
    }
  }

  return objects;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGunSlug(slug) {
  if (!slug || EXCLUDED_WEAPON_SLUGS.has(slug)) return false;
  return !EXCLUDED_WEAPON_PATTERNS.some((pattern) => pattern.test(slug));
}

async function discoverWeaponSlugs() {
  const res = await fetch(DISCOVERY_URL, {
    headers: { 'user-agent': 'Mozilla/5.0' }
  });

  if (!res.ok) {
    throw new Error(`Could not fetch discovery page: ${res.status}`);
  }

  const html = await res.text();
  const slugs = new Set();

  for (const match of html.matchAll(/\/weapons\/([a-z0-9-]+)/g)) {
    const slug = String(match[1] || '').trim();
    if (isGunSlug(slug)) slugs.add(slug);
  }

  const discovered = [...slugs].filter((slug) => KNOWN_GUN_SLUGS.has(slug)).sort();
  return discovered.length ? discovered : [...KNOWN_GUN_SLUGS].sort();
}

async function getFxRateUsdToAzn() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=AZN', {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });

    if (!res.ok) throw new Error(`FX request failed: ${res.status}`);

    const data = await res.json();
    const rate = Number(data?.rates?.AZN);

    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid AZN rate from FX source');

    return {
      rate,
      provider: 'frankfurter.app',
      fetchedAt: new Date().toISOString()
    };
  } catch {
    return {
      rate: FALLBACK_USD_TO_AZN,
      provider: 'fallback',
      fetchedAt: null
    };
  }
}

function parseItem(product, usdToAznRate, weaponSlug) {
  const fullName = String(product?.name || '').trim();
  const [weaponNameRaw, skinNameRaw] = fullName.split('|').map((x) => String(x || '').trim());
  const weaponName = weaponNameRaw || weaponSlug.toUpperCase();
  const skinName = skinNameRaw || fullName;
  const lowPriceUsd = Number(product?.offers?.lowPrice);
  const highPriceUsd = Number(product?.offers?.highPrice);
  const offersCount = Number(product?.offers?.offerCount);

  if (!Number.isFinite(lowPriceUsd) || lowPriceUsd <= 0) return null;

  const lowPriceAzn = +(lowPriceUsd * usdToAznRate).toFixed(2);

  return {
    weapon: weaponName,
    weaponSlug,
    fullName,
    skinName,
    itemUrl: product?.url || null,
    imageUrl: Array.isArray(product?.image) ? product.image[0] : null,
    lowPriceUsd,
    highPriceUsd: Number.isFinite(highPriceUsd) ? highPriceUsd : null,
    lowPriceAzn,
    offerCount: Number.isFinite(offersCount) ? offersCount : null,
    sourceCurrency: product?.offers?.priceCurrency || 'USD'
  };
}

async function scrapeWeapon(slug, fxRate) {
  const sourceUrl = `${BASE_URL}/weapons/${slug}`;
  let res;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    res = await fetch(sourceUrl, {
      headers: { 'user-agent': 'Mozilla/5.0' }
    });

    if (res.ok) break;
    if (res.status !== 429 || attempt === 4) {
      throw new Error(`Could not fetch ${slug}: ${res.status}`);
    }

    await sleep(600 * attempt);
  }

  const html = await res.text();
  const jsonLdObjects = extractJsonLdObjects(html);
  const itemList = jsonLdObjects.find((x) => x?.['@type'] === 'ItemList');

  if (!itemList?.itemListElement?.length) {
    return {
      source: sourceUrl,
      weaponSlug: slug,
      weapon: slug.toUpperCase(),
      count: 0,
      items: []
    };
  }

  const items = itemList.itemListElement
    .map((entry) => parseItem(entry?.item, fxRate, slug))
    .filter(Boolean)
    .filter((item) => item.lowPriceAzn <= LIMIT_AZN)
    .sort((a, b) => a.lowPriceAzn - b.lowPriceAzn || a.lowPriceUsd - b.lowPriceUsd);

  const weaponName = items[0]?.weapon || String(itemList?.name || slug).replace(/\s+skins?$/i, '').trim();

  return {
    source: sourceUrl,
    weaponSlug: slug,
    weapon: weaponName,
    count: items.length,
    items
  };
}

async function main() {
  const weaponSlugs = await discoverWeaponSlugs();
  if (weaponSlugs.length === 0) throw new Error('No gun slugs discovered on weapons index.');

  const fx = await getFxRateUsdToAzn();

  const scrapedAt = new Date().toISOString();
  const perWeaponOutputs = [];

  for (const slug of weaponSlugs) {
    try {
      const output = await scrapeWeapon(slug, fx.rate);
      perWeaponOutputs.push(output);
    } catch (error) {
      console.warn(`Skipping ${slug}: ${error.message || error}`);
    }

    await sleep(220);
  }

  await mkdir(PER_WEAPON_OUTPUT_DIR, { recursive: true });

  for (const weaponOutput of perWeaponOutputs) {
    const perWeaponPath = new URL(`${weaponOutput.weaponSlug}-under-20-azn.json`, PER_WEAPON_OUTPUT_DIR);
    const fileData = {
      source: weaponOutput.source,
      weapon: weaponOutput.weapon,
      weaponSlug: weaponOutput.weaponSlug,
      currencyTarget: 'AZN',
      fx: {
        base: 'USD',
        target: 'AZN',
        rate: fx.rate,
        provider: fx.provider,
        fetchedAt: fx.fetchedAt
      },
      scrapedAt,
      count: weaponOutput.count,
      limitAzn: LIMIT_AZN,
      items: weaponOutput.items
    };

    await writeFile(perWeaponPath, `${JSON.stringify(fileData, null, 2)}\n`, 'utf8');
  }

  const items = perWeaponOutputs
    .flatMap((x) => x.items)
    .sort((a, b) => a.weapon.localeCompare(b.weapon) || a.lowPriceAzn - b.lowPriceAzn || a.lowPriceUsd - b.lowPriceUsd);

  const weaponSummary = perWeaponOutputs.map((x) => ({
    weapon: x.weapon,
    weaponSlug: x.weaponSlug,
    count: x.count
  }));

  const output = {
    source: DISCOVERY_URL,
    currencyTarget: 'AZN',
    fx: {
      base: 'USD',
      target: 'AZN',
      rate: fx.rate,
      provider: fx.provider,
      fetchedAt: fx.fetchedAt
    },
    scrapedAt,
    weaponsCount: weaponSummary.length,
    weapons: weaponSummary,
    count: items.length,
    limitAzn: LIMIT_AZN,
    items
  };

  await writeFile(AGGREGATE_OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const scarOutput = perWeaponOutputs.find((x) => x.weaponSlug === 'scar-20');
  if (scarOutput) {
    const legacyData = {
      source: `${BASE_URL}/weapons/scar-20`,
      weapon: scarOutput.weapon,
      weaponSlug: 'scar-20',
      currencyTarget: 'AZN',
      fx: output.fx,
      scrapedAt,
      count: scarOutput.count,
      limitAzn: LIMIT_AZN,
      items: scarOutput.items
    };

    await writeFile(LEGACY_SCAR_OUTPUT_PATH, `${JSON.stringify(legacyData, null, 2)}\n`, 'utf8');
  }

  console.log(
    `Saved ${items.length} items under ${LIMIT_AZN} AZN across ${weaponSummary.length} guns to ${AGGREGATE_OUTPUT_PATH.pathname}`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
