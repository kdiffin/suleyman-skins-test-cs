const rows = document.getElementById('rows');
const meta = document.getElementById('meta');
const weaponFilter = document.getElementById('weaponFilter');
const previewModal = document.getElementById('previewModal');
const previewImage = document.getElementById('previewImage');
const previewTitle = document.getElementById('previewTitle');
const previewClose = document.getElementById('previewClose');

let allItems = [];

function getFallbackImageSvg(label) {
  const text = (label || 'Skin').slice(0, 18);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1f2937"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" fill="#cbd5e1" font-family="Inter,Arial,sans-serif" font-size="34">${text}</text></svg>`
  )}`;
}

function openPreview(item) {
  const src = item.imageUrl || item.imageUrlOriginal || getFallbackImageSvg(item.skinName);
  previewImage.src = src;
  previewImage.alt = item.fullName || item.skinName || 'Skin preview';
  previewTitle.textContent = `${item.weapon} | ${item.skinName}`;
  if (typeof previewModal.showModal === 'function') {
    previewModal.showModal();
  }
}

function closePreview() {
  if (previewModal.open) previewModal.close();
}

function fmtMoney(value, code) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 2
  }).format(value);
}

function renderRow(item) {
  const tr = document.createElement('tr');

  const weaponCell = document.createElement('td');
  weaponCell.textContent = item.weapon;

  const skinCell = document.createElement('td');
  const skinWrap = document.createElement('button');
  skinWrap.type = 'button';
  skinWrap.className = 'skin skin-button';

  const thumb = document.createElement('img');
  thumb.src = item.imageUrl || item.imageUrlOriginal || getFallbackImageSvg(item.skinName);
  thumb.alt = item.skinName;
  thumb.loading = 'lazy';
  thumb.addEventListener('error', () => {
    thumb.src = getFallbackImageSvg(item.skinName);
  });

  const name = document.createElement('span');
  name.textContent = item.skinName;

  skinWrap.append(thumb, name);
  skinWrap.addEventListener('click', () => openPreview(item));
  skinCell.append(skinWrap);

  const aznCell = document.createElement('td');
  aznCell.className = 'price-azn';
  aznCell.textContent = fmtMoney(item.lowPriceAzn, 'AZN');

  const usdCell = document.createElement('td');
  usdCell.textContent = fmtMoney(item.lowPriceUsd, 'USD');

  const offersCell = document.createElement('td');
  offersCell.textContent = item.offerCount?.toLocaleString('en-US') ?? '-';

  const linkCell = document.createElement('td');
  linkCell.innerHTML = item.itemUrl
    ? `<a href="${item.itemUrl}" target="_blank" rel="noopener noreferrer">Open</a>`
    : '-';

  tr.append(weaponCell, skinCell, aznCell, usdCell, offersCell, linkCell);
  return tr;
}

function renderRows() {
  const selected = weaponFilter.value;
  const filtered = selected === 'all' ? allItems : allItems.filter((item) => item.weaponSlug === selected);
  rows.replaceChildren(...filtered.map(renderRow));
}

async function init() {
  const res = await fetch('./data/all-guns-under-20-azn.json', { cache: 'no-store' });
  if (!res.ok) {
    meta.textContent = 'Failed to load data.';
    return;
  }

  const data = await res.json();
  const updated = data.scrapedAt ? new Date(data.scrapedAt).toLocaleString() : 'n/a';

  allItems = data.items || [];

  meta.textContent = `${data.count} items • ${data.weaponsCount} guns • limit ${data.limitAzn} AZN • FX ${data.fx.base}->${data.fx.target}: ${data.fx.rate} (${data.fx.provider}) • updated ${updated}`;

  const uniqueWeapons = (data.weapons || [])
    .filter((x) => x.count > 0)
    .sort((a, b) => a.weapon.localeCompare(b.weapon));

  weaponFilter.replaceChildren(
    new Option('All', 'all'),
    ...uniqueWeapons.map((w) => new Option(`${w.weapon} (${w.count})`, w.weaponSlug))
  );

  weaponFilter.addEventListener('change', renderRows);
  previewClose.addEventListener('click', closePreview);
  previewModal.addEventListener('click', (event) => {
    if (event.target === previewModal) closePreview();
  });

  renderRows();
}

init().catch(() => {
  meta.textContent = 'Unexpected error while loading data.';
});
