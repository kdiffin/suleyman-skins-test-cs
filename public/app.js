const rows = document.getElementById('rows');
const meta = document.getElementById('meta');
const weaponFilter = document.getElementById('weaponFilter');

let allItems = [];

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
  skinCell.innerHTML = `
    <div class="skin">
      <img src="${item.imageUrl || ''}" alt="${item.skinName}" loading="lazy" />
      <span>${item.skinName}</span>
    </div>
  `;

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
  renderRows();
}

init().catch(() => {
  meta.textContent = 'Unexpected error while loading data.';
});
